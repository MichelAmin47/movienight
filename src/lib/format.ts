/** Today's date in the user's timezone as YYYY-MM-DD (the format of `watches.watched_on`). */
export function todayIso(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const dateFormat = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

/** Formats a YYYY-MM-DD date as e.g. "12 november 2026" without timezone shifts. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return dateFormat.format(new Date(year, month - 1, day))
}

/** One-decimal score with a Dutch decimal comma, e.g. "4,3". */
export function formatScore(score: number): string {
  return score.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
}
