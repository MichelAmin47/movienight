import { describe, expect, it } from 'vitest'
import { everyoneScore, isUnrated, parseDraft, scoresFor, type BulkItem } from './bulkSelection'

const item = (scores: Record<string, number>): BulkItem => ({
  tmdbId: 1,
  title: 'Rocky',
  year: 1976,
  posterPath: null,
  scores,
})

describe('parseDraft', () => {
  it('returns an empty list for missing or broken storage', () => {
    expect(parseDraft(null)).toEqual([])
    expect(parseDraft('{oops')).toEqual([])
    expect(parseDraft('{"a":1}')).toEqual([])
  })

  it('keeps valid items with their scores', () => {
    const stored = [item({ a: 4, b: 5 })]
    expect(parseDraft(JSON.stringify(stored))).toEqual(stored)
  })

  it('drops malformed entries, duplicates and invalid scores', () => {
    const raw = JSON.stringify([
      null,
      { title: 'No id' },
      { tmdbId: 1, title: 'Rocky', scores: { a: 4, b: 9, c: 'x' } },
      { tmdbId: 1, title: 'Rocky again' },
    ])
    expect(parseDraft(raw)).toEqual([{ tmdbId: 1, title: 'Rocky', year: null, posterPath: null, scores: { a: 4 } }])
  })
})

describe('everyoneScore', () => {
  it('is the score only when everyone shares it', () => {
    expect(everyoneScore({ a: 4, b: 4 }, ['a', 'b'])).toBe(4)
    expect(everyoneScore({ a: 4, b: 3 }, ['a', 'b'])).toBeNull()
    expect(everyoneScore({ a: 4 }, ['a', 'b'])).toBeNull()
    expect(everyoneScore({}, [])).toBeNull()
  })
})

describe('scoresFor', () => {
  it('drops scores of people who no longer exist', () => {
    expect(scoresFor({ a: 4, gone: 2 }, ['a', 'b'])).toEqual({ a: 4 })
  })
})

describe('isUnrated', () => {
  it('ignores scores of people who no longer exist', () => {
    expect(isUnrated(item({}), ['a'])).toBe(true)
    expect(isUnrated(item({ gone: 3 }), ['a'])).toBe(true)
    expect(isUnrated(item({ a: 3 }), ['a', 'b'])).toBe(false)
  })
})
