import { describe, expect, it, vi } from 'vitest'
import { seededRandom } from './suggestions'
import { BUFFER_SIZE, REFILL_BELOW, tipsKey, TipsStore, withoutIds, type Tip, type TipList, type TipsDeps, type TipsInputs } from './tipsStore'
import type { TmdbMovieSummary } from './tmdb'

const SOURCES = [1, 2, 3, 4, 5, 6, 7, 8]

const watch = (tmdbId: number, score = 5) => ({
  tmdb_id: tmdbId,
  movie: { title: `Movie ${tmdbId}`, genre_ids: [10] },
  ratings: [{ person_id: 'p1', score }],
})

const inputs = (patch: Partial<TipsInputs> = {}): TipsInputs => ({
  householdId: 'h1',
  watches: SOURCES.map((id) => watch(id)),
  dismissed: [],
  personId: null,
  showAdult: false,
  hideUnknown: false,
  ...patch,
})

const summary = (id: number): TmdbMovieSummary => ({
  id,
  title: `Rec ${id}`,
  original_title: `Rec ${id}`,
  release_date: '2020-01-01',
  poster_path: null,
  genre_ids: [10],
  overview: '',
})

/** Every fifth movie is 16+, every seventh has no certification. */
const certification = (id: number) => (id % 5 === 0 ? '16' : id % 7 === 0 ? null : '6')

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

/** A store on fake TMDB data whose responses arrive spread out over time, like the real ones. */
function setup(shared: { storage?: ReturnType<typeof memoryStorage>; canSwap?: () => boolean } = {}) {
  const calls = { recommendations: 0, details: 0 }
  const deps: TipsDeps = {
    getRecommendations: async (tmdbId, page = 1) => {
      calls.recommendations++
      await delay(1 + ((tmdbId * 7) % 10))
      // Neighbouring sources overlap, so candidates get different scores.
      return Array.from({ length: 20 }, (_, k) => summary(1000 * page + tmdbId * 10 + k))
    },
    ensureMovies: async (ids) => {
      calls.details++
      await delay(3)
      return new Map(ids.map((id) => [id, { certification_nl: certification(id), runtime: 90 }]))
    },
    discoverMovies: async () => {
      await delay(2)
      return [summary(5001), summary(5002)]
    },
    getGenres: async () => ({ 10: 'Familie' }),
    storage: shared.storage ?? memoryStorage(),
    recentStorage: memoryStorage(),
    rng: seededRandom(42),
    canSwap: shared.canSwap ?? (() => true),
  }
  const store = new TipsStore(deps)
  // Every distinct list the page would render, in order.
  const rendered: (Tip[] | null)[] = [null]
  store.subscribe(() => {
    const tips = store.getState().list?.tips ?? null
    if (tips !== rendered[rendered.length - 1]) rendered.push(tips)
  })
  const idle = () =>
    vi.waitFor(() => {
      const state = store.getState()
      if (state.computing || state.shuffling) throw new Error('still busy')
    })
  return { store, calls, rendered, idle, storage: deps.storage! }
}

const ids = (tips: Tip[] | null | undefined) => (tips ?? []).map((tip) => tip.id)

describe('TipsStore', () => {
  it('renders nothing until the list is complete, then changes the rendered list exactly once', async () => {
    const { store, rendered, idle, calls } = setup()
    store.setInputs(inputs())
    expect(store.getState()).toMatchObject({ list: null, computing: true })
    await idle()

    // Many staggered responses, one render of the list.
    expect(calls.recommendations).toBe(SOURCES.length)
    expect(calls.details).toBeGreaterThan(1)
    expect(rendered).toHaveLength(2)
    const { list } = store.getState()
    expect(list!.tips).toHaveLength(20)
    expect(list!.buffer.length).toBeGreaterThanOrEqual(BUFFER_SIZE)
    // The list was already filtered when it appeared.
    for (const tip of [...list!.tips, ...list!.buffer]) expect(tip.certification).not.toBe('16')
    expect(new Set(ids(list!.tips)).size).toBe(20)
  })

  it('applies the hide-unknown filter before the list is shown', async () => {
    const { store, idle } = setup()
    store.setInputs(inputs({ hideUnknown: true, showAdult: true }))
    await idle()
    const { tips } = store.getState().list!
    expect(tips).toHaveLength(20)
    expect(tips.every((tip) => tip.certification !== null)).toBe(true)
    expect(tips.some((tip) => tip.certification === '16')).toBe(true)
  })

  it('shows the cached list at once on a revisit with the same inputs, without recomputing', async () => {
    const first = setup()
    first.store.setInputs(inputs())
    await first.idle()

    const second = setup({ storage: first.storage })
    // Same inputs in another order give the same key.
    second.store.setInputs(inputs({ watches: [...SOURCES].reverse().map((id) => watch(id)) }))
    expect(second.store.getState().computing).toBe(false)
    expect(ids(second.store.getState().list?.tips)).toEqual(ids(first.store.getState().list?.tips))
    expect(second.rendered).toHaveLength(2)
    await delay(30)
    expect(second.calls).toEqual({ recommendations: 0, details: 0 })
    expect(second.rendered).toHaveLength(2)
  })

  it('keeps the old list unchanged while new inputs are computed, then swaps once', async () => {
    const { store, rendered, idle } = setup()
    store.setInputs(inputs())
    await idle()
    const before = store.getState().list!.tips

    store.setInputs(inputs({ showAdult: true }))
    expect(store.getState().computing).toBe(true)
    expect(store.getState().list!.tips).toBe(before)
    await idle()

    expect(rendered).toHaveLength(3)
    expect(store.getState().list!.tips.some((tip) => tip.certification === '16')).toBe(true)
  })

  it('offers the new list instead of swapping while the user is scrolled down or spinning', async () => {
    let scrolledDown = false
    const { store, rendered, idle } = setup({ canSwap: () => !scrolledDown })
    store.setInputs(inputs())
    await idle()
    const before = store.getState().list!.tips

    scrolledDown = true
    store.setInputs(inputs({ showAdult: true }))
    await idle()
    expect(store.getState().list!.tips).toBe(before)
    expect(store.getState().staged).not.toBeNull()
    expect(rendered).toHaveLength(2)

    store.showStaged()
    expect(store.getState().staged).toBeNull()
    expect(rendered).toHaveLength(3)

    // The same goes for a spinning carousel.
    scrolledDown = false
    store.hold(true)
    store.setInputs(inputs())
    await idle()
    expect(rendered).toHaveLength(3)
    expect(store.getState().staged).not.toBeNull()
  })

  it('replaces the list by a complete shuffle in one go and keeps it until the inputs change', async () => {
    const first = setup()
    first.store.setInputs(inputs())
    await first.idle()
    const before = first.store.getState().list!.tips

    const shuffling = first.store.shuffle()
    expect(first.store.getState().list!.tips).toBe(before)
    await shuffling
    const shuffled = first.store.getState().list!.tips
    expect(first.rendered).toHaveLength(3)
    expect(shuffled).toHaveLength(20)
    expect(ids(shuffled)).not.toEqual(ids(before))
    expect(shuffled.every((tip) => tip.certification !== '16')).toBe(true)

    // A revisit shows the shuffled list, not a fresh top 20.
    const second = setup({ storage: first.storage })
    second.store.setInputs(inputs())
    expect(ids(second.store.getState().list?.tips)).toEqual(ids(shuffled))
    expect(second.calls).toEqual({ recommendations: 0, details: 0 })
  })

  it('dismissing replaces only that tile from the buffer, without reordering or recomputing', async () => {
    const { store, rendered, idle, calls } = setup()
    store.setInputs(inputs())
    await idle()
    const before = store.getState().list!
    const callsBefore = { ...calls }
    const dismissedId = before.tips[4].id

    const replacement = store.dismiss(dismissedId)
    const after = store.getState().list!
    expect(replacement).toBe(before.buffer[0].id)
    expect(ids(after.tips)).toEqual(ids(before.tips).map((id) => (id === dismissedId ? replacement : id)))
    expect(rendered).toHaveLength(3)

    // The household data catching up with the dismissal changes nothing.
    store.setInputs(inputs({ dismissed: [dismissedId] }))
    expect(store.getState().computing).toBe(false)
    expect(store.getState().list!.tips).toBe(after.tips)
    expect(calls).toEqual(callsBefore)
  })

  it('tops up the buffer in the background without touching the visible tips', async () => {
    const { store, idle, calls } = setup()
    store.setInputs(inputs())
    await idle()
    const lookups = calls.details
    while (store.getState().list!.buffer.length >= REFILL_BELOW) store.dismiss(store.getState().list!.tips[0].id)
    const visible = store.getState().list!.tips
    expect(visible).toHaveLength(20)

    await vi.waitFor(() => expect(store.getState().list!.buffer.length).toBeGreaterThanOrEqual(BUFFER_SIZE))
    expect(calls.details).toBeGreaterThan(lookups)
    expect(store.getState().list!.tips).toBe(visible)
  })

  it('computes again when a dismissal could not be saved', async () => {
    const { store, idle } = setup()
    store.setInputs(inputs())
    await idle()
    const original = ids(store.getState().list!.tips)
    store.dismiss(original[0])
    store.undismiss(original[0])
    await idle()
    expect(ids(store.getState().list!.tips)).toEqual(original)
  })
})

describe('tipsKey', () => {
  it('changes with every input and ignores order', () => {
    const base = tipsKey(inputs())
    expect(tipsKey(inputs({ watches: [...SOURCES].reverse().map((id) => watch(id)) }))).toBe(base)
    expect(tipsKey(inputs({ dismissed: [3, 2] }))).toBe(tipsKey(inputs({ dismissed: [2, 3] })))
    const changed = [
      inputs({ dismissed: [2] }),
      inputs({ personId: 'p1' }),
      inputs({ showAdult: true }),
      inputs({ hideUnknown: true }),
      inputs({ watches: [...SOURCES.map((id) => watch(id)), watch(99)] }),
      inputs({ watches: SOURCES.map((id) => watch(id, id === 1 ? 4 : 5)) }),
    ].map(tipsKey)
    expect(new Set([base, ...changed]).size).toBe(changed.length + 1)
  })
})

describe('withoutIds', () => {
  const tip = (id: number): Tip => ({
    id,
    title: `Rec ${id}`,
    releaseDate: '',
    posterPath: null,
    overview: '',
    explanation: { kind: 'sources', titles: [] },
    certification: null,
    runtime: null,
  })
  const list: TipList = {
    key: 'k',
    householdId: 'h1',
    personId: null,
    showAdult: false,
    hideUnknown: false,
    tips: [1, 2, 3].map(tip),
    buffer: [4, 5].map(tip),
    queue: [tip(6)],
  }

  it('fills the gap in place and shrinks the list only when the buffer is empty', () => {
    const once = withoutIds(list, new Set([2]))
    expect(ids(once.tips)).toEqual([1, 4, 3])
    expect(ids(once.buffer)).toEqual([5])
    const all = withoutIds(list, new Set([1, 2, 3, 5]))
    expect(ids(all.tips)).toEqual([4])
    expect(withoutIds(list, new Set([99]))).toBe(list)
  })
})
