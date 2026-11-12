/** One movie in the running "Snel toevoegen" selection. */
export type BulkItem = {
  tmdbId: number
  title: string
  year: number | null
  posterPath: string | null
  /** person id → score; people without a score are absent. */
  scores: Record<string, number>
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

/** Reads a stored draft defensively: malformed entries and duplicates are dropped. */
export function parseDraft(raw: string | null): BulkItem[] {
  let draft: unknown
  try {
    draft = JSON.parse(raw ?? '[]')
  } catch {
    return []
  }
  if (!Array.isArray(draft)) return []
  const seen = new Set<number>()
  const items: BulkItem[] = []
  for (const entry of draft as Partial<BulkItem>[]) {
    if (!entry || typeof entry !== 'object') continue
    if (typeof entry.tmdbId !== 'number' || typeof entry.title !== 'string' || seen.has(entry.tmdbId)) continue
    seen.add(entry.tmdbId)
    const scores = entry.scores && typeof entry.scores === 'object' ? entry.scores : {}
    items.push({
      tmdbId: entry.tmdbId,
      title: entry.title,
      year: typeof entry.year === 'number' ? entry.year : null,
      posterPath: typeof entry.posterPath === 'string' ? entry.posterPath : null,
      scores: Object.fromEntries(Object.entries(scores).filter(([, score]) => isScore(score))),
    })
  }
  return items
}

/** The shared score when every given person has the same one, otherwise null. */
export function everyoneScore(scores: Record<string, number>, personIds: string[]): number | null {
  if (personIds.length === 0) return null
  const first = scores[personIds[0]]
  return first !== undefined && personIds.every((id) => scores[id] === first) ? first : null
}

/** Keeps only the scores of people who (still) exist. */
export function scoresFor(scores: Record<string, number>, personIds: string[]): Record<string, number> {
  return Object.fromEntries(personIds.flatMap((id) => (id in scores ? [[id, scores[id]]] : [])))
}

/** A movie nobody gave stars; it is saved but does not count for suggestions. */
export function isUnrated(item: BulkItem, personIds: string[]): boolean {
  return !personIds.some((id) => id in item.scores)
}
