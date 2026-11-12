/** Dutch (Kijkwijzer / NICAM) age ratings as TMDB reports them for region NL. */
export const MAX_AGE_OPTIONS = ['AL', '6', '9', '12'] as const
export type MaxAge = (typeof MAX_AGE_OPTIONS)[number]
export const DEFAULT_MAX_AGE: MaxAge = '9'

/** Minimum age for a certification, or null when it is missing or unrecognised. */
export function certificationAge(certification: string | null | undefined): number | null {
  const value = certification?.trim().toUpperCase()
  if (!value) return null
  if (value === 'AL') return 0
  const age = Number.parseInt(value, 10)
  return Number.isFinite(age) ? age : null
}

/** Null certification means "unknown"; the caller decides whether to show those. */
export function isAllowed(certification: string | null | undefined, maxAge: MaxAge): boolean | null {
  const age = certificationAge(certification)
  if (age === null) return null
  return age <= (certificationAge(maxAge) ?? 0)
}

/** Shape of TMDB's `release_dates` (sub)response. */
export type TmdbReleaseDates = {
  results: { iso_3166_1: string; release_dates: { certification: string; type: number }[] }[]
}

/**
 * Picks the Dutch certification from TMDB release dates, preferring the
 * theatrical release (type 3). Returns null when NL has none.
 */
export function nlCertification(details: { release_dates?: TmdbReleaseDates }): string | null {
  const nl = details.release_dates?.results.find((r) => r.iso_3166_1 === 'NL')
  const withCertification = (nl?.release_dates ?? []).filter((d) => d.certification.trim())
  const best = withCertification.find((d) => d.type === 3) ?? withCertification[0]
  return best ? best.certification.trim().toUpperCase() : null
}
