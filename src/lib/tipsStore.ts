import { isAllowed } from './kijkwijzer'
import {
  buildPool,
  MAX_SUGGESTIONS,
  mergeRecommendations,
  rankCandidates,
  ratedMovies,
  sourceMovies,
  topGenres,
  weightedOrder,
  type Candidate,
  type RatedMovie,
} from './suggestions'
import type { TmdbMovieSummary } from './tmdb'

/**
 * The list behind the Tips page. A list is always computed completely
 * (recommendations, ranking, certification lookups) before it is published,
 * so the page never renders a partial or unfiltered list. Finished lists are
 * cached in localStorage under a hash of their inputs.
 *
 * No React and no direct I/O here: everything external comes in through
 * `TipsDeps`, so the behaviour can be unit tested.
 */

/** Extra filtered tips kept behind the visible ones, to fill the gap after a dismissal. */
export const BUFFER_SIZE = 8
/** The buffer is topped up in the background when it gets shorter than this. */
export const REFILL_BELOW = 4
/** Unchecked candidates kept with a list for topping up the buffer. */
export const QUEUE_SIZE = 60
/** Recommendation requests that run at the same time. */
const SOURCE_CONCURRENCY = 6
/** Candidates whose details (certification) are looked up per round. */
const DETAIL_BATCH = 12
/** Upper bound on detail lookups per computation, to keep TMDB usage modest. */
const MAX_DETAIL_LOOKUPS = 400

// A shuffle makes at most 7 TMDB calls for fresh candidates: page 2 of the
// recommendations of up to 5 liked movies, one discover call (two if the
// random page turns out to be empty). Cached responses cost nothing.
const SHUFFLE_EXTRA_SOURCES = 5
const DISCOVER_MAX_PAGE = 5
/** How many earlier shuffles count as "recently shown". */
const RECENT_SHUFFLES = 2

export const TIPS_CACHE_KEY = 'filmavond.tips'
export const RECENT_KEY = 'filmavond.recentTips'
const CACHE_VERSION = 2
/** Watchlist movies mixed into a list, on top of the fresh suggestions. */
export const MAX_WATCHLIST_TIPS = 3
/** Cached lists kept, most recent first (a few, so switching person back is instant). */
const CACHE_ENTRIES = 5

/** Why a movie is suggested; turned into text by the page. */
export type Explanation =
  | { kind: 'sources'; titles: string[] }
  /** `genre` is the genre name, or null when it is not known. */
  | { kind: 'genre'; genre: string | null }

/** A candidate whose certification has not been checked yet. */
export type TipDraft = {
  id: number
  title: string
  releaseDate: string
  posterPath: string | null
  overview: string
  /** From the TMDB list result; replaced by the `movies` row's genres once that is looked up. */
  genreIds: number[]
  explanation: Explanation
}

export type Tip = TipDraft & { certification: string | null; runtime: number | null }

export type TipList = {
  /** Hash of the inputs this list was computed for. */
  key: string
  householdId: string
  personId: string | null
  showAdult: boolean
  hideUnknown: boolean
  /**
   * What the page shows, in order: up to 20 movies that are not on the
   * watchlist, plus at most `MAX_WATCHLIST_TIPS` that are.
   */
  tips: Tip[]
  /** Next tips that already passed the filters. */
  buffer: Tip[]
  /** Candidates after those, not looked up yet. */
  queue: TipDraft[]
}

export type TipsInputs = {
  householdId: string
  watches: {
    tmdb_id: number
    movie: { title: string; genre_ids: number[] }
    ratings: { person_id: string; score: number }[]
  }[]
  dismissed: number[]
  /** Movies on the "Willen we zien" list. */
  watchlist: number[]
  personId: string | null
  showAdult: boolean
  hideUnknown: boolean
}

export type TipsState = {
  /** The list on screen; null while the very first one is being computed. */
  list: TipList | null
  /** A finished list that was not swapped in because the user is busy with the current one. */
  staged: TipList | null
  /** A background computation is running. */
  computing: boolean
  shuffling: boolean
  error: boolean
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export type TipsDeps = {
  getRecommendations: (tmdbId: number, page?: number) => Promise<TmdbMovieSummary[]>
  ensureMovies: (
    tmdbIds: number[],
  ) => Promise<Map<number, { certification_nl: string | null; runtime: number | null; genre_ids?: number[] }>>
  discoverMovies: (genreIds: number[], page: number) => Promise<TmdbMovieSummary[]>
  getGenres: () => Promise<Record<number, string>>
  /** Where finished lists are cached (localStorage); null when unavailable. */
  storage: StorageLike | null
  /** Where the recently shuffled ids are kept (sessionStorage); null when unavailable. */
  recentStorage: StorageLike | null
  rng: () => number
  /** False while the user is scrolled down: a new list then waits. */
  canSwap: () => boolean
}

/** Stable hash (cyrb53) of a string, as hex. */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

/**
 * Cache key for a set of inputs: watched ids with their ratings, dismissed
 * ids, watchlist ids, the filter settings and the person toggle. Order does
 * not matter.
 */
export function tipsKey(inputs: TipsInputs): string {
  const watches = inputs.watches
    .map(
      (watch) =>
        `${watch.tmdb_id}:${watch.ratings
          .map((r) => `${r.person_id}=${r.score}`)
          .sort()
          .join(',')}`,
    )
    .sort()
  const sorted = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b)
  const dismissed = sorted(inputs.dismissed)
  const watchlist = sorted(inputs.watchlist)
  return hash(
    JSON.stringify([
      CACHE_VERSION,
      inputs.householdId,
      inputs.personId,
      inputs.showAdult,
      inputs.hideUnknown,
      watches,
      dismissed,
      watchlist,
    ]),
  )
}

/**
 * Takes the given movies out of a list. A removed visible tip is replaced, in
 * the same place, by the next one from the buffer; the others keep their order.
 * Returns the same list when nothing had to change.
 */
export function withoutIds(list: TipList, ids: Set<number>): TipList {
  const inList = (tip: TipDraft) => ids.has(tip.id)
  if (!list.tips.some(inList) && !list.buffer.some(inList) && !list.queue.some(inList)) return list
  const buffer = list.buffer.filter((tip) => !inList(tip))
  const tips = list.tips.some(inList)
    ? list.tips.flatMap((tip) => (inList(tip) ? buffer.splice(0, 1) : [tip]))
    : list.tips
  return { ...list, tips, buffer, queue: list.queue.filter((tip) => !inList(tip)) }
}

/**
 * Moves tips from the buffer to the end of the visible ones until there are
 * `MAX_SUGGESTIONS` that are not on the watchlist (or the buffer is empty).
 */
export function toppedUp(list: TipList, watchlist: Set<number>): TipList {
  const fresh = list.tips.filter((tip) => !watchlist.has(tip.id)).length
  const missing = Math.min(MAX_SUGGESTIONS - fresh, list.buffer.length)
  if (missing <= 0) return list
  return { ...list, tips: [...list.tips, ...list.buffer.slice(0, missing)], buffer: list.buffer.slice(missing) }
}

function sameTips(a: Tip[], b: Tip[]): boolean {
  return a.length === b.length && a.every((tip, index) => tip.id === b[index].id)
}

function readCache(storage: StorageLike | null): TipList[] {
  try {
    const stored = JSON.parse(storage?.getItem(TIPS_CACHE_KEY) ?? 'null')
    return stored?.v === CACHE_VERSION && Array.isArray(stored.entries) ? stored.entries : []
  } catch {
    return []
  }
}

function readRecent(storage: StorageLike | null): number[][] {
  try {
    const stored = JSON.parse(storage?.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

export class TipsStore {
  private state: TipsState = { list: null, staged: null, computing: false, shuffling: false, error: false }
  private listeners = new Set<() => void>()
  private inputs: TipsInputs | null = null
  private key: string | null = null
  /** The key of the same inputs without the watchlist, to recognise a change of only the watchlist. */
  private baseKey: string | null = null
  /** Bumped whenever running work becomes obsolete; its result is then dropped. */
  private generation = 0
  /** Dismissed during this visit, before the household data has caught up. */
  private hidden = new Set<number>()
  private refilling = false
  private held = false
  /** Bumped whenever another list is put on screen (not when one is edited in place). */
  private shown = 0
  /** First-page recommendations per source movie, kept for the visit. */
  private recommendations = new Map<number, TmdbMovieSummary[]>()
  /** Page 2 of recommendations per source movie, fetched by shuffles. */
  private moreRecommendations = new Map<number, TmdbMovieSummary[]>()
  /** Movies found by favorite genre, fetched by shuffles. */
  private discovered: TmdbMovieSummary[] = []
  private recent: number[][]
  private deps: TipsDeps

  constructor(deps: TipsDeps) {
    this.deps = deps
    this.recent = readRecent(deps.recentStorage)
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = () => this.state

  private set(patch: Partial<TipsState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** Stops running work, e.g. when the page goes away. */
  dispose() {
    this.generation++
    this.key = null
    this.baseKey = null
    this.refilling = false
    this.set({ computing: false, shuffling: false })
  }

  /** Tells the store what the list should be based on. Cheap when nothing changed. */
  setInputs(inputs: TipsInputs) {
    this.inputs = inputs
    this.sync()
  }

  private effectiveInputs(): TipsInputs {
    const inputs = this.inputs!
    return this.hidden.size ? { ...inputs, dismissed: [...inputs.dismissed, ...this.hidden] } : inputs
  }

  private excluded(inputs: TipsInputs): Set<number> {
    return new Set([...inputs.watches.map((w) => w.tmdb_id), ...inputs.dismissed])
  }

  private sync() {
    const inputs = this.effectiveInputs()
    const key = tipsKey(inputs)
    if (key === this.key) return
    const baseKey = tipsKey({ ...inputs, watchlist: [] })
    const onlyWatchlist = baseKey === this.baseKey
    this.baseKey = baseKey
    this.key = key
    const shown = this.state.list
    if (onlyWatchlist && shown && !this.state.computing && !this.state.shuffling) {
      // A star was tapped on the list on screen. Nothing moves or disappears
      // under the user's finger: the list is only topped up so it keeps 20
      // movies that are not on the watchlist. It keeps its old key, so the
      // exact list for the new watchlist is computed on the next visit.
      this.set({ list: toppedUp(shown, new Set(inputs.watchlist)) })
      this.refill()
      return
    }
    // Whatever was being computed or waiting was for other inputs.
    const generation = ++this.generation
    this.refilling = false
    const current = this.state.list
    if (current?.key === key) {
      this.set({ staged: null, computing: false, shuffling: false })
      return
    }

    const entries = readCache(this.deps.storage)
    const cached = entries.find((entry) => entry.key === key)
    if (cached) {
      this.set({ computing: false, shuffling: false, error: false })
      this.deliver(cached, false)
      return
    }

    let list = current
    if (!list) {
      // Nothing on screen yet: start from the last list for the same person
      // and filters (minus what was watched or dismissed since), so a revisit
      // after rating a movie does not start with an empty page.
      const previous = entries.find(
        (entry) =>
          entry.householdId === inputs.householdId &&
          entry.personId === inputs.personId &&
          entry.showAdult === inputs.showAdult &&
          entry.hideUnknown === inputs.hideUnknown,
      )
      list = previous ? withoutIds(previous, this.excluded(inputs)) : null
    }
    this.set({ list, staged: null, computing: true, shuffling: false, error: false })

    void this.compute(inputs).then(({ list: computed, failed }) => {
      if (generation !== this.generation) return
      this.set({ computing: false, error: failed })
      this.deliver(computed, false, !failed)
    })
  }

  /** Publishes a finished list in one go, or parks it when the user is busy with the current one. */
  private deliver(computed: TipList, direct: boolean, cache = true) {
    const list = { ...withoutIds(computed, this.hidden), key: this.key! }
    if (cache) this.save(list)
    const current = this.state.list
    if (direct || !current || sameTips(current.tips, list.tips) || (!this.held && this.deps.canSwap())) {
      this.shown++
      this.set({ list, staged: null })
      this.refill()
    } else {
      this.set({ staged: list })
    }
  }

  /** While held (the carousel is spinning), a new list waits instead of replacing the current one. */
  hold(held: boolean) {
    this.held = held
  }

  /** Swaps in the list that was waiting behind "new tips available". */
  showStaged() {
    const { staged } = this.state
    if (!staged) return
    this.shown++
    this.set({ list: staged, staged: null })
    this.refill()
  }

  private save(list: TipList) {
    if (!this.deps.storage) return
    const stored = { ...list, queue: list.queue.slice(0, QUEUE_SIZE) }
    const entries = [stored, ...readCache(this.deps.storage).filter((entry) => entry.key !== list.key)]
    try {
      this.deps.storage.setItem(
        TIPS_CACHE_KEY,
        JSON.stringify({ v: CACHE_VERSION, entries: entries.slice(0, CACHE_ENTRIES) }),
      )
    } catch {
      // Storage full or unavailable; the list is then computed again next time.
    }
  }

  /**
   * Removes one movie the household is not interested in. Its place is taken
   * by the next tip from the buffer; nothing else moves. Returns the id of the
   * replacement, if there was one.
   */
  dismiss(tmdbId: number): number | null {
    if (!this.inputs) return null
    const previousKey = this.key
    this.hidden.add(tmdbId)
    const inputs = this.effectiveInputs()
    const key = (this.key = tipsKey(inputs))
    this.baseKey = tipsKey({ ...inputs, watchlist: [] })
    // A watchlist movie came on top of the 20 fresh ones, so it leaves without a replacement.
    const without = (list: TipList) =>
      inputs.watchlist.includes(tmdbId)
        ? { ...list, tips: list.tips.filter((tip) => tip.id !== tmdbId) }
        : withoutIds(list, new Set([tmdbId]))
    // A list that was up to date, minus this movie, is exactly the list for
    // the new inputs: it takes the new key and nothing is computed again.
    const edit = (list: TipList | null) =>
      list && { ...without(list), key: list.key === previousKey ? key : list.key }
    const { list, staged } = this.state
    const index = list ? list.tips.findIndex((tip) => tip.id === tmdbId) : -1
    const next = edit(list)
    this.set({ list: next, staged: edit(staged) })
    const latest = this.state.staged ?? next
    if (latest?.key === key) this.save(latest)
    this.refill()
    const replacement = next && index >= 0 && next.tips.length === list!.tips.length ? next.tips[index] : null
    return replacement?.id ?? null
  }

  /** Undoes `dismiss` when saving it failed; the list is then computed again. */
  undismiss(tmdbId: number) {
    if (!this.hidden.delete(tmdbId) || !this.inputs) return
    this.sync()
  }

  /** Tops up the buffer of the visible list from its queue, without touching the visible tips. */
  private refill() {
    const list = this.state.list
    if (!list || this.refilling || list.buffer.length >= REFILL_BELOW || list.queue.length === 0) return
    this.refilling = true
    const { generation, shown } = this
    const starred = new Set(this.inputs?.watchlist)
    // The buffer only ever holds movies that are not on the watchlist.
    const candidates = list.queue.filter((draft) => !starred.has(draft.id))
    void this.fill(candidates, BUFFER_SIZE - list.buffer.length, list, DETAIL_BATCH * 4).then(({ ready, queue }) => {
      if (generation !== this.generation) return
      this.refilling = false
      const current = this.state.list
      // Only when the same list is still on screen (dismissals edit it in place).
      if (!current || shown !== this.shown) return
      const next = withoutIds({ ...current, buffer: [...current.buffer, ...ready], queue }, this.hidden)
      // Dismissals that found the buffer empty left the list short: add to the end.
      const filled = toppedUp(next, new Set(this.inputs?.watchlist))
      this.set({ list: filled })
      if (filled.key === this.key && !this.state.staged) this.save(filled)
      this.refill()
    })
  }

  /** "Nieuwe tips": a weighted random list, published only when it is complete. */
  async shuffle() {
    const inputs = this.inputs && this.effectiveInputs()
    if (!inputs || this.state.shuffling || this.state.computing) return
    const rated = ratedMovies(inputs.watches, inputs.personId)
    const sources = sourceMovies(rated)
    if (sources.length === 0) return
    const generation = this.generation
    this.set({ shuffling: true, error: false })

    // What is on screen now should mostly not come back in the next shuffles.
    this.recent = [...this.recent, (this.state.list?.tips ?? []).map((tip) => tip.id)].slice(-RECENT_SHUFFLES)
    try {
      this.deps.recentStorage?.setItem(RECENT_KEY, JSON.stringify(this.recent))
    } catch {
      // Storage unavailable; the in-memory copy still works for this visit.
    }

    const { rng } = this.deps
    const pickRandom = <T>(items: T[], count: number): T[] => {
      const pool = [...items]
      const picked: T[] = []
      while (picked.length < count && pool.length > 0) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
      return picked
    }
    // Prefer liked movies whose second page has not been fetched yet, so
    // repeated shuffles keep bringing in new titles.
    const extraSources = [
      ...pickRandom(
        sources.filter((source) => !this.moreRecommendations.has(source.tmdbId)),
        SHUFFLE_EXTRA_SOURCES,
      ),
      ...pickRandom(
        sources.filter((source) => this.moreRecommendations.has(source.tmdbId)),
        SHUFFLE_EXTRA_SOURCES,
      ),
    ].slice(0, SHUFFLE_EXTRA_SOURCES)
    const genres = topGenres(rated)
    const [first, pages, found, names] = await Promise.all([
      this.loadRecommendations(sources),
      Promise.allSettled(extraSources.map((source) => this.deps.getRecommendations(source.tmdbId, 2))),
      genres.length
        ? this.deps.discoverMovies(genres, 1 + Math.floor(rng() * DISCOVER_MAX_PAGE)).catch(() => [])
        : Promise.resolve([]),
      // Only needed for the "favorite genre" explanation; cached for a month.
      this.deps.getGenres().catch(() => null),
    ])
    if (generation !== this.generation) return

    // Failed extra fetches are skipped: the shuffle then simply has fewer new titles.
    pages.forEach((page, index) => {
      if (page.status === 'fulfilled') this.moreRecommendations.set(extraSources[index].tmdbId, page.value)
    })
    const known = new Set(this.discovered.map((movie) => movie.id))
    this.discovered = [...this.discovered, ...found.filter((movie) => !known.has(movie.id))]

    const pool = buildPool(
      rankCandidates({
        rated,
        recommendations: mergeRecommendations(first.recommendations, this.moreRecommendations),
        discover: this.discovered,
        excluded: this.excluded(inputs),
      }),
    )
    const order = weightedOrder(pool, { rng, recentIds: new Set(this.recent.flat()) })
    const { list, failed } = await this.build(
      order.map((candidate) => toDraft(candidate, names)),
      inputs,
    )
    if (generation !== this.generation) return
    this.set({ shuffling: false, error: first.failed || failed })
    // Asked for by the user, so it replaces the current list right away.
    this.deliver(list, true, !(first.failed || failed))
  }

  private async loadRecommendations(sources: RatedMovie[]) {
    const missing = sources.map((source) => source.tmdbId).filter((id) => !this.recommendations.has(id))
    let failed = false
    for (let i = 0; i < missing.length; i += SOURCE_CONCURRENCY) {
      const batch = missing.slice(i, i + SOURCE_CONCURRENCY)
      const results = await Promise.allSettled(batch.map((id) => this.deps.getRecommendations(id)))
      if (results.every((result) => result.status === 'rejected')) failed = true
      results.forEach((result, index) => {
        // A failed source counts as "no recommendations" for this list; it is tried again next time.
        if (result.status === 'fulfilled') this.recommendations.set(batch[index], result.value)
      })
    }
    return { recommendations: this.recommendations, failed }
  }

  /** The default list: the best candidates by score. */
  private async compute(inputs: TipsInputs): Promise<{ list: TipList; failed: boolean }> {
    const rated = ratedMovies(inputs.watches, inputs.personId)
    const loaded = await this.loadRecommendations(sourceMovies(rated))
    const ranked = rankCandidates({
      rated,
      recommendations: loaded.recommendations,
      excluded: this.excluded(inputs),
    })
    const built = await this.build(
      ranked.map((candidate) => toDraft(candidate, null)),
      inputs,
    )
    return { list: built.list, failed: loaded.failed || built.failed }
  }

  /**
   * Turns candidates, best first, into a list: 20 movies that are not on the
   * watchlist (plus the buffer), and on top of those the first
   * `MAX_WATCHLIST_TIPS` candidates that are, each at its own place in the
   * order. Other watchlist movies are left out.
   */
  private async build(order: TipDraft[], inputs: TipsInputs): Promise<{ list: TipList; failed: boolean }> {
    const watchlist = new Set(inputs.watchlist)
    const starred = order.filter((draft) => watchlist.has(draft.id)).slice(0, MAX_WATCHLIST_TIPS)
    const fresh = watchlist.size ? order.filter((draft) => !watchlist.has(draft.id)) : order
    const filled = await this.fill(fresh, MAX_SUGGESTIONS + BUFFER_SIZE, inputs, MAX_DETAIL_LOOKUPS)
    const { ready, queue } = filled
    let { failed } = filled
    let tips = ready.slice(0, MAX_SUGGESTIONS)
    if (starred.length > 0) {
      // Watchlist movies are already in the `movies` table, so this costs no TMDB calls.
      const extra = await this.fill(starred, starred.length, inputs, starred.length)
      failed ||= extra.failed
      const place = new Map(order.map((draft, index) => [draft.id, index]))
      tips = [...tips, ...extra.ready].sort((a, b) => place.get(a.id)! - place.get(b.id)!)
    }
    return {
      list: {
        key: tipsKey(inputs),
        householdId: inputs.householdId,
        personId: inputs.personId,
        showAdult: inputs.showAdult,
        hideUnknown: inputs.hideUnknown,
        tips,
        buffer: ready.slice(MAX_SUGGESTIONS),
        queue,
      },
      failed,
    }
  }

  /**
   * Walks candidates in order, looking up certifications a batch at a time,
   * until `want` of them passed the age filter. Only as many lookups happen
   * as are needed; `queue` is what was not looked at.
   */
  private async fill(
    order: TipDraft[],
    want: number,
    filter: { showAdult: boolean; hideUnknown: boolean },
    budget: number,
  ): Promise<{ ready: Tip[]; queue: TipDraft[]; failed: boolean }> {
    const ready: Tip[] = []
    let failed = false
    let index = 0
    while (ready.length < want && index < order.length && index < budget) {
      const batch = order.slice(index, index + DETAIL_BATCH)
      index += batch.length
      let movies: Awaited<ReturnType<TipsDeps['ensureMovies']>>
      try {
        movies = await this.deps.ensureMovies(batch.map((draft) => draft.id))
      } catch {
        // Treated as "certification unknown", so the list can still finish.
        failed = true
        movies = new Map()
      }
      for (const draft of batch) {
        const movie = movies.get(draft.id)
        const certification = movie?.certification_nl ?? null
        const allowed = isAllowed(certification, filter.showAdult)
        if (allowed === false || (allowed === null && filter.hideUnknown)) continue
        ready.push({
          ...draft,
          genreIds: movie?.genre_ids ?? draft.genreIds,
          certification,
          runtime: movie?.runtime ?? null,
        })
      }
    }
    return { ready, queue: order.slice(index), failed }
  }
}

function toDraft(candidate: Candidate, genreNames: Record<number, string> | null): TipDraft {
  const { movie } = candidate
  return {
    id: movie.id,
    title: movie.title,
    releaseDate: movie.release_date,
    posterPath: movie.poster_path,
    overview: movie.overview,
    genreIds: movie.genre_ids,
    explanation:
      candidate.sources.length > 0
        ? { kind: 'sources', titles: candidate.sources.slice(0, 2).map((source) => source.title) }
        : {
            kind: 'genre',
            genre: candidate.genreMatch === undefined ? null : (genreNames?.[candidate.genreMatch] ?? null),
          },
  }
}
