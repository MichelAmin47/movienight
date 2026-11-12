import { describe, expect, it } from 'vitest'
import { certificationAge, isAllowed, nlCertification } from './kijkwijzer'
import {
  buildPool,
  displayKey,
  genreAffinity,
  mergeRecommendations,
  rankCandidates,
  ratedMovies,
  seededRandom,
  selectVisible,
  sourceMovies,
  topGenres,
  weightedOrder,
  type Candidate,
} from './suggestions'
import type { TmdbMovieSummary } from './tmdb'

const watch = (tmdbId: number, genres: number[], scores: Record<string, number>) => ({
  tmdb_id: tmdbId,
  movie: { title: `Movie ${tmdbId}`, genre_ids: genres },
  ratings: Object.entries(scores).map(([person_id, score]) => ({ person_id, score })),
})

const rec = (id: number, genres: number[] = []): TmdbMovieSummary => ({
  id,
  title: `Rec ${id}`,
  original_title: `Rec ${id}`,
  release_date: '2020-01-01',
  poster_path: null,
  genre_ids: genres,
  overview: '',
})

describe('ratedMovies', () => {
  it('averages all scores across repeat viewings', () => {
    const rated = ratedMovies([watch(1, [], { a: 5, b: 3 }), watch(1, [], { a: 4 })])
    expect(rated).toHaveLength(1)
    expect(rated[0].score).toBe(4)
  })

  it('uses only one person when filtered and skips movies they did not rate', () => {
    const rated = ratedMovies([watch(1, [], { a: 5, b: 1 }), watch(2, [], { a: 4 })], 'b')
    expect(rated).toEqual([expect.objectContaining({ tmdbId: 1, score: 1 })])
  })

  it('ignores watches without ratings', () => {
    expect(ratedMovies([watch(1, [], {})])).toEqual([])
  })
})

describe('sourceMovies', () => {
  it('keeps movies averaging 3.5 or higher', () => {
    const rated = ratedMovies([watch(1, [], { a: 4, b: 3 }), watch(2, [], { a: 3, b: 3 }), watch(3, [], { a: 5 })])
    expect(sourceMovies(rated).map((m) => m.tmdbId)).toEqual([1, 3])
  })
})

describe('genreAffinity', () => {
  it('is positive for liked genres, negative for disliked, and damped for small samples', () => {
    const affinity = genreAffinity(ratedMovies([watch(1, [10], { a: 5 }), watch(2, [10, 20], { a: 5 }), watch(3, [20], { a: 1 })]))
    expect(affinity.get(10)).toBeCloseTo(4 / 3)
    expect(affinity.get(20)).toBe(0)
    expect(genreAffinity(ratedMovies([watch(4, [30], { a: 1 })])).get(30)).toBe(-1)
  })
})

describe('rankCandidates', () => {
  const rated = ratedMovies([watch(1, [10], { a: 5 }), watch(2, [10], { a: 4 }), watch(3, [20], { a: 1 })])

  it('sums (average − 3) over the source movies that recommend a candidate', () => {
    const ranked = rankCandidates({
      rated,
      recommendations: new Map([
        [1, [rec(100), rec(101)]],
        [2, [rec(100)]],
      ]),
      excluded: new Set(),
    })
    expect(ranked.map((c) => c.movie.id)).toEqual([100, 101])
    expect(ranked[0].score).toBe(3)
    expect(ranked[1].score).toBe(2)
    expect(ranked[0].sources.map((s) => s.tmdbId)).toEqual([1, 2])
  })

  it('never uses low-scoring movies as sources', () => {
    const ranked = rankCandidates({ rated, recommendations: new Map([[3, [rec(100)]]]), excluded: new Set() })
    expect(ranked).toEqual([])
  })

  it('excludes watched and dismissed movies', () => {
    const ranked = rankCandidates({
      rated,
      recommendations: new Map([[1, [rec(100), rec(2), rec(101)]]]),
      excluded: new Set([2, 101]),
    })
    expect(ranked.map((c) => c.movie.id)).toEqual([100])
  })

  it('gives a bonus for liked genres and a penalty for disliked ones', () => {
    const ranked = rankCandidates({
      rated,
      recommendations: new Map([[1, [rec(100, [20]), rec(101, [10]), rec(102, [99])]]]),
      excluded: new Set(),
    })
    expect(ranked.map((c) => c.movie.id)).toEqual([101, 102, 100])
    expect(ranked[0].score).toBeGreaterThan(2)
    expect(ranked[1].score).toBe(2)
    expect(ranked[2].score).toBeLessThan(2)
  })

  it('counts a source once even if TMDB repeats a movie', () => {
    const ranked = rankCandidates({ rated, recommendations: new Map([[1, [rec(100), rec(100)]]]), excluded: new Set() })
    expect(ranked[0].score).toBe(2)
  })
})

describe('kijkwijzer', () => {
  it('maps certifications to ages', () => {
    expect(certificationAge('AL')).toBe(0)
    expect(certificationAge('12')).toBe(12)
    expect(certificationAge('')).toBeNull()
    expect(certificationAge(null)).toBeNull()
  })

  it('hides 16 and 18 unless 16+ movies are enabled', () => {
    for (const certification of ['AL', '6', '9', '12', '14']) {
      expect(isAllowed(certification, false)).toBe(true)
      expect(isAllowed(certification, true)).toBe(true)
    }
    for (const certification of ['16', '18']) {
      expect(isAllowed(certification, false)).toBe(false)
      expect(isAllowed(certification, true)).toBe(true)
    }
  })

  it('reports an unknown certification as null regardless of the toggle', () => {
    expect(isAllowed(null, false)).toBeNull()
    expect(isAllowed('', true)).toBeNull()
  })

  it('picks the Dutch certification, preferring the theatrical release', () => {
    const details = {
      release_dates: {
        results: [
          { iso_3166_1: 'US', release_dates: [{ certification: 'PG', type: 3 }] },
          {
            iso_3166_1: 'NL',
            release_dates: [
              { certification: '', type: 1 },
              { certification: '9', type: 4 },
              { certification: '6', type: 3 },
            ],
          },
        ],
      },
    }
    expect(nlCertification(details)).toBe('6')
    expect(nlCertification({ release_dates: { results: [] } })).toBeNull()
    expect(nlCertification({})).toBeNull()
  })
})

describe('discover candidates', () => {
  const rated = ratedMovies([watch(1, [10], { a: 5 }), watch(2, [20], { a: 1 }), watch(3, [30], { a: 4 })])

  it('scores genre-based movies from genre affinity only and records the best genre', () => {
    const ranked = rankCandidates({
      rated,
      recommendations: new Map([[1, [rec(100)]]]),
      discover: [rec(200, [30, 10]), rec(201, [20])],
      excluded: new Set(),
    })
    const byId = new Map(ranked.map((c) => [c.movie.id, c]))
    expect(byId.get(200)!.sources).toEqual([])
    expect(byId.get(200)!.genreMatch).toBe(10)
    expect(byId.get(200)!.score).toBeCloseTo(0.25 * ((1 + 0.5) / 2))
    expect(byId.get(201)!.score).toBeLessThan(0)
    expect(ranked[0].movie.id).toBe(100)
  })

  it('keeps a recommended movie as recommended and still excludes watched or dismissed ones', () => {
    const ranked = rankCandidates({
      rated,
      recommendations: new Map([[1, [rec(100)]]]),
      discover: [rec(100, [10]), rec(1, [10]), rec(300, [10])],
      excluded: new Set([1, 300]),
    })
    expect(ranked).toHaveLength(1)
    expect(ranked[0].sources).toHaveLength(1)
    expect(ranked[0].genreMatch).toBeUndefined()
  })

  it('lists liked genres strongest first', () => {
    expect(topGenres(rated)).toEqual([10, 30])
    expect(topGenres(rated, 1)).toEqual([10])
  })

  it('appends extra recommendation pages per source', () => {
    const merged = mergeRecommendations(new Map([[1, [rec(100)]]]), new Map([[1, [rec(101)]], [2, [rec(102)]]]))
    expect(merged.get(1)!.map((m) => m.id)).toEqual([100, 101])
    expect(merged.get(2)!.map((m) => m.id)).toEqual([102])
  })
})

const candidate = (id: number, score: number, recommended = true): Candidate => ({
  movie: rec(id),
  score,
  sources: recommended ? [{ tmdbId: 1, title: 'Movie 1', weight: 1 }] : [],
})

/** 80 candidates with scores from 4 down to about 0, ids 1..80 (1 is the strongest). */
const pool = Array.from({ length: 80 }, (_, i) => candidate(i + 1, 4 - i * 0.05))

/** How often each id lands in the first 20 over many seeded shuffles. */
function top20Counts(runs: number, recentIds?: Set<number>): Map<number, number> {
  const counts = new Map<number, number>()
  for (let seed = 1; seed <= runs; seed++) {
    for (const c of weightedOrder(pool, { rng: seededRandom(seed), recentIds }).slice(0, 20)) {
      counts.set(c.movie.id, (counts.get(c.movie.id) ?? 0) + 1)
    }
  }
  return counts
}

describe('buildPool', () => {
  it('takes the best candidates up to the pool size', () => {
    const ranked = Array.from({ length: 120 }, (_, i) => candidate(i + 1, 10 - i * 0.01))
    const built = buildPool(ranked)
    expect(built).toHaveLength(80)
    expect(built.map((c) => c.movie.id)).toEqual(ranked.slice(0, 80).map((c) => c.movie.id))
  })

  it('keeps places for genre-based candidates even though they score lowest', () => {
    const ranked = [
      ...Array.from({ length: 100 }, (_, i) => candidate(i + 1, 10 - i * 0.01)),
      ...Array.from({ length: 30 }, (_, i) => candidate(1000 + i, 0.4 - i * 0.01, false)),
    ]
    const built = buildPool(ranked)
    expect(built).toHaveLength(80)
    expect(built.filter((c) => c.sources.length === 0).map((c) => c.movie.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => 1000 + i),
    )
  })

  it('returns everything when there are fewer candidates than the pool size', () => {
    expect(buildPool([candidate(1, 2), candidate(2, 0.1, false)])).toHaveLength(2)
  })
})

describe('weightedOrder', () => {
  it('returns every candidate exactly once', () => {
    const order = weightedOrder(pool, { rng: seededRandom(42) })
    expect(order).toHaveLength(pool.length)
    expect(new Set(order.map((c) => c.movie.id)).size).toBe(pool.length)
  })

  it('is deterministic for a seed and differs between seeds', () => {
    const ids = (seed: number) => weightedOrder(pool, { rng: seededRandom(seed) }).map((c) => c.movie.id)
    expect(ids(7)).toEqual(ids(7))
    expect(ids(7)).not.toEqual(ids(8))
  })

  it('does not simply return the ranking', () => {
    const first20 = weightedOrder(pool, { rng: seededRandom(3) }).slice(0, 20).map((c) => c.movie.id)
    expect(first20).not.toEqual(pool.slice(0, 20).map((c) => c.movie.id))
  })

  it('favours strong matches but gives weak ones a real chance', () => {
    const counts = top20Counts(300)
    const strongest = [1, 2, 3, 4, 5].reduce((sum, id) => sum + (counts.get(id) ?? 0), 0) / 5
    const weakest = [76, 77, 78, 79, 80].reduce((sum, id) => sum + (counts.get(id) ?? 0), 0) / 5
    expect(strongest).toBeGreaterThan(weakest * 5)
    expect(strongest / 300).toBeGreaterThan(0.4)
    const fromLowerHalf = [...counts].filter(([id]) => id > 40).reduce((sum, [, n]) => sum + n, 0)
    expect(fromLowerHalf / 300).toBeGreaterThan(1)
  })

  it('strongly penalises recently shown movies', () => {
    const recent = new Set(pool.slice(0, 20).map((c) => c.movie.id))
    const without = top20Counts(200)
    const withPenalty = top20Counts(200, recent)
    const repeats = (counts: Map<number, number>) =>
      [...recent].reduce((sum, id) => sum + (counts.get(id) ?? 0), 0) / 200
    expect(repeats(without)).toBeGreaterThan(8)
    expect(repeats(withPenalty)).toBeLessThan(2)
  })

  it('still fills the list when almost everything was shown recently', () => {
    const small = pool.slice(0, 22)
    const order = weightedOrder(small, { rng: seededRandom(1), recentIds: new Set(small.map((c) => c.movie.id)) })
    expect(new Set(order.map((c) => c.movie.id)).size).toBe(22)
  })

  it('handles an empty pool and a single candidate', () => {
    expect(weightedOrder([], { rng: seededRandom(1) })).toEqual([])
    expect(weightedOrder([candidate(1, -3)], { rng: seededRandom(1) })).toHaveLength(1)
  })
})

describe('selectVisible', () => {
  const certifications = new Map<number, string | null>([
    [1, 'AL'],
    [2, '16'],
    [3, null],
    [4, '12'],
    [5, '18'],
    [6, '6'],
  ])
  const order = [1, 2, 3, 4, 5, 6].map((id) => candidate(id, 1))
  const select = (showAdult: boolean, hideUnknown: boolean, count = 20) =>
    selectVisible(order, {
      certificationOf: (id) => certifications.get(id),
      isAllowed: (certification) => isAllowed(certification, showAdult),
      hideUnknown,
      count,
    }).visible.map((v) => v.candidate.movie.id)

  it('applies the 16+ toggle and the hide-unknown option, keeping the given order', () => {
    expect(select(false, false)).toEqual([1, 3, 4, 6])
    expect(select(false, true)).toEqual([1, 4, 6])
    expect(select(true, false)).toEqual([1, 2, 3, 4, 5, 6])
    expect(select(true, true)).toEqual([1, 2, 4, 5, 6])
  })

  it('stops at the requested count', () => {
    expect(select(true, false, 3)).toEqual([1, 2, 3])
  })

  it('never lets a filtered shuffle through: sampled order plus filters has no 16+ and no duplicates', () => {
    const shuffled = weightedOrder(order, { rng: seededRandom(5) })
    const { visible } = selectVisible(shuffled, {
      certificationOf: (id) => certifications.get(id),
      isAllowed: (certification) => isAllowed(certification, false),
      hideUnknown: true,
    })
    const ids = visible.map((v) => v.candidate.movie.id)
    expect([...ids].sort()).toEqual([1, 4, 6])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('stops at a movie without loaded details and asks for the next batch', () => {
    const loaded = new Map<number, string | null>([[1, 'AL']])
    const result = selectVisible(order, {
      certificationOf: (id) => loaded.get(id),
      isAllowed: (certification) => isAllowed(certification, false),
      hideUnknown: false,
      batch: 3,
    })
    expect(result.visible.map((v) => v.candidate.movie.id)).toEqual([1])
    expect(result.pending).toEqual([2, 3, 4])
    const exhausted = selectVisible(order, {
      certificationOf: (id) => loaded.get(id),
      isAllowed: () => true,
      hideUnknown: false,
      canLookup: false,
    })
    expect(exhausted.pending).toEqual([])
  })
})

describe('displayKey', () => {
  it('is stable per movie and seed, and reorders movies between seeds', () => {
    expect(displayKey(10, 1)).toBe(displayKey(10, 1))
    const sorted = (seed: number) => [1, 2, 3, 4, 5, 6, 7, 8].sort((a, b) => displayKey(a, seed) - displayKey(b, seed))
    expect(sorted(1)).not.toEqual(sorted(2))
    expect(sorted(1)).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
