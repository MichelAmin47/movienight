import { describe, expect, it } from 'vitest'
import { certificationAge, isAllowed, nlCertification } from './kijkwijzer'
import { genreAffinity, rankCandidates, ratedMovies, sourceMovies } from './suggestions'
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

  it('compares against the maximum age and reports unknown as null', () => {
    expect(isAllowed('6', '9')).toBe(true)
    expect(isAllowed('9', '9')).toBe(true)
    expect(isAllowed('12', '9')).toBe(false)
    expect(isAllowed('AL', 'AL')).toBe(true)
    expect(isAllowed('6', 'AL')).toBe(false)
    expect(isAllowed(null, '9')).toBeNull()
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
