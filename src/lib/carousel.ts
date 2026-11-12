/** Pure carousel maths (ring window, snapping, spin target). No DOM here so it can be unit tested. */

/** Posters on each side of the centre; 7 gives a ring of at most 15. */
export const MAX_RING_HALF = 7
/** A spin passes at least this many posters, so it always looks like a real spin. */
export const SPIN_MIN_TRAVEL = 30
/** ...and at most this many, so a long list does not load hundreds of posters. */
export const SPIN_MAX_TRAVEL = 45

/** `value` modulo `count`, always in 0..count-1 (also for negative values). */
export function wrapIndex(value: number, count: number): number {
  if (count <= 0) return 0
  return ((value % count) + count) % count
}

/** The item index that is centred (or nearest to the centre) at a ring position. */
export function centeredIndex(position: number, count: number): number {
  return wrapIndex(Math.round(position), count)
}

/** Uniformly random index in 0..count-1, or -1 for an empty list. `rng` returns values in [0, 1). */
export function pickRandomIndex(count: number, rng: () => number = Math.random): number {
  if (count <= 0) return -1
  return Math.min(count - 1, Math.floor(rng() * count))
}

export type RingSlot = {
  /** Unbounded slot number; stable while the ring turns, so it works as a React key. */
  slot: number
  /** Index into the item list. */
  index: number
  /** Signed distance to the centre in posters (0 is centred, negative is to the left). */
  offset: number
}

/**
 * The posters to render around `position`: a window of at most
 * 2 × maxHalf + 1 slots, however long the list is. Short lists get a smaller
 * window so an item is not repeated more than needed.
 */
export function ringWindow(position: number, count: number, maxHalf = MAX_RING_HALF): RingSlot[] {
  if (count <= 0) return []
  const half = Math.min(maxHalf, Math.floor(count / 2))
  const center = Math.round(position)
  const slots: RingSlot[] = []
  for (let slot = center - half; slot <= center + half; slot++) {
    slots.push({ slot, index: wrapIndex(slot, count), offset: slot - position })
  }
  return slots
}

export function easeOutCubic(progress: number): number {
  const t = Math.min(1, Math.max(0, progress))
  return 1 - (1 - t) ** 3
}

/**
 * Where a spin starts and stops. `to` is a ring position that shows `winner`,
 * always forward from `from` by SPIN_MIN_TRAVEL..SPIN_MAX_TRAVEL posters.
 * Short lists go round several times; when the winner is further away than
 * the maximum, the spin starts closer to it (`from` is then not `position`).
 */
export function spinPlan(input: {
  position: number
  count: number
  winner: number
  minTravel?: number
  maxTravel?: number
}): { from: number; to: number } {
  const { count, winner, minTravel = SPIN_MIN_TRAVEL, maxTravel = SPIN_MAX_TRAVEL } = input
  const from = Math.round(input.position)
  if (count <= 0) return { from, to: from }
  let travel = wrapIndex(winner - from, count)
  if (travel < minTravel) travel += Math.ceil((minTravel - travel) / count) * count
  const to = from + travel
  return { from: travel > maxTravel ? to - maxTravel : from, to }
}

/**
 * Ring position after the item list changed: stay on the item that was
 * centred when it still exists, otherwise on the same place in the list.
 */
export function repositionAfterChange(position: number, previousKeys: string[], keys: string[]): number {
  if (keys.length === 0) return 0
  const previousIndex = centeredIndex(position, previousKeys.length)
  const kept = keys.indexOf(previousKeys[previousIndex])
  return kept >= 0 ? kept : Math.min(previousIndex, keys.length - 1)
}
