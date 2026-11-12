import { describe, expect, it } from 'vitest'
import {
  SPIN_MAX_TRAVEL,
  SPIN_MIN_TRAVEL,
  centeredIndex,
  easeOutCubic,
  pickRandomIndex,
  repositionAfterChange,
  ringWindow,
  spinPlan,
  wrapIndex,
} from './carousel'

describe('wrapIndex / centeredIndex', () => {
  it('wraps in both directions', () => {
    expect(wrapIndex(7, 5)).toBe(2)
    expect(wrapIndex(-1, 5)).toBe(4)
    expect(wrapIndex(-10, 5)).toBe(0)
    expect(wrapIndex(3, 0)).toBe(0)
  })

  it('snaps a position to the nearest item', () => {
    expect(centeredIndex(2.4, 10)).toBe(2)
    expect(centeredIndex(2.6, 10)).toBe(3)
    expect(centeredIndex(-0.6, 10)).toBe(9)
    expect(centeredIndex(23, 10)).toBe(3)
  })
})

describe('pickRandomIndex', () => {
  it('returns -1 for an empty list', () => {
    expect(pickRandomIndex(0)).toBe(-1)
  })

  it('maps the rng range onto every index equally', () => {
    const count = 7
    const steps = 7000
    const hits = Array.from({ length: count }, () => 0)
    for (let i = 0; i < steps; i++) hits[pickRandomIndex(count, () => i / steps)]++
    expect(hits).toEqual(Array.from({ length: count }, () => steps / count))
  })

  it('stays inside the list at the edges of the rng range', () => {
    expect(pickRandomIndex(5, () => 0)).toBe(0)
    expect(pickRandomIndex(5, () => 0.999999)).toBe(4)
    expect(pickRandomIndex(5, () => 1)).toBe(4)
    expect(pickRandomIndex(1, () => 0.5)).toBe(0)
  })

  it('uses Math.random by default', () => {
    for (let i = 0; i < 200; i++) {
      const index = pickRandomIndex(3)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(3)
    }
  })
})

describe('spinPlan', () => {
  it('always stops on the winner, forward, within the travel limits', () => {
    for (const count of [1, 2, 3, 5, 14, 15, 20, 44, 45, 46, 100, 500]) {
      for (const position of [0, 1, count - 1, count + 3, -2, 7.4]) {
        for (const winner of new Set([0, 1, Math.floor(count / 2), count - 1].filter((w) => w < count))) {
          const { from, to } = spinPlan({ position, count, winner })
          expect(centeredIndex(to, count)).toBe(winner)
          expect(Number.isInteger(to)).toBe(true)
          expect(to - from).toBeGreaterThanOrEqual(SPIN_MIN_TRAVEL)
          expect(to - from).toBeLessThanOrEqual(Math.max(SPIN_MAX_TRAVEL, SPIN_MIN_TRAVEL + count - 1))
        }
      }
    }
  })

  it('spins a short list round several times from where it is', () => {
    expect(spinPlan({ position: 1, count: 5, winner: 3 })).toEqual({ from: 1, to: 33 })
    // Landing on the poster that is already centred still spins.
    expect(spinPlan({ position: 2, count: 5, winner: 2 })).toEqual({ from: 2, to: 32 })
  })

  it('starts from the current position when the winner is within reach', () => {
    expect(spinPlan({ position: 10, count: 100, winner: 50 })).toEqual({ from: 10, to: 50 })
  })

  it('skips ahead when the winner is too far away in a long list', () => {
    expect(spinPlan({ position: 10, count: 500, winner: 300 })).toEqual({ from: 255, to: 300 })
    // Behind the current position: go round the list, but only show the last stretch.
    expect(spinPlan({ position: 10, count: 500, winner: 5 })).toEqual({ from: 460, to: 505 })
  })

  it('does nothing for an empty list', () => {
    expect(spinPlan({ position: 0, count: 0, winner: -1 })).toEqual({ from: 0, to: 0 })
  })
})

describe('ringWindow', () => {
  it('renders at most 15 posters around the position', () => {
    const slots = ringWindow(40.3, 200)
    expect(slots).toHaveLength(15)
    expect(slots[0]).toMatchObject({ slot: 33, index: 33 })
    expect(slots[7].index).toBe(40)
    expect(slots[7].offset).toBeCloseTo(-0.3)
    expect(slots[14].index).toBe(47)
  })

  it('wraps around the ends of the list', () => {
    expect(ringWindow(0, 20).map((s) => s.index)).toEqual([13, 14, 15, 16, 17, 18, 19, 0, 1, 2, 3, 4, 5, 6, 7])
    expect(ringWindow(-1, 20)[7]).toEqual({ slot: -1, index: 19, offset: 0 })
  })

  it('shrinks for short lists', () => {
    expect(ringWindow(0, 0)).toEqual([])
    expect(ringWindow(3, 1).map((s) => s.index)).toEqual([0])
    expect(ringWindow(0, 3).map((s) => s.index)).toEqual([2, 0, 1])
    expect(ringWindow(0, 5).map((s) => s.index)).toEqual([3, 4, 0, 1, 2])
  })
})

describe('easeOutCubic', () => {
  it('starts fast, ends slow and stays within 0..1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
    expect(easeOutCubic(0.25) - easeOutCubic(0)).toBeGreaterThan(easeOutCubic(1) - easeOutCubic(0.75))
  })
})

describe('repositionAfterChange', () => {
  it('follows the centred item to its new place', () => {
    expect(repositionAfterChange(2, ['a', 'b', 'c', 'd'], ['c', 'a', 'd'])).toBe(0)
    expect(repositionAfterChange(6, ['a', 'b', 'c', 'd'], ['x', 'c'])).toBe(1)
  })

  it('keeps the place in the list when the centred item is gone', () => {
    expect(repositionAfterChange(1, ['a', 'b', 'c'], ['a', 'c'])).toBe(1)
    expect(repositionAfterChange(2, ['a', 'b', 'c'], ['a', 'b'])).toBe(1)
    expect(repositionAfterChange(2, ['a', 'b', 'c'], [])).toBe(0)
  })
})
