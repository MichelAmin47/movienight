/**
 * In-memory cache for signed storage URLs. Paths are signed in one batch and
 * reused until shortly before they expire.
 */
export type SignBatch = (paths: string[], expiresInSeconds: number) => Promise<Record<string, string>>

export function createSignedUrlCache(
  sign: SignBatch,
  { ttlSeconds = 3600, marginSeconds = 300, now = () => Date.now() } = {},
) {
  const entries = new Map<string, { url: string; expiresAt: number }>()
  const fresh = (path: string) => {
    const entry = entries.get(path)
    return entry && entry.expiresAt - marginSeconds * 1000 > now() ? entry.url : undefined
  }

  return {
    /** True when at least one path has no usable URL (missing or about to expire). */
    isStale: (paths: string[]) => paths.some((path) => !fresh(path)),
    /** URLs for the given paths; signs the missing and expiring ones in one call. */
    async get(paths: string[]): Promise<Record<string, string>> {
      const stale = [...new Set(paths)].filter((path) => !fresh(path))
      if (stale.length > 0) {
        const requestedAt = now()
        const signed = await sign(stale, ttlSeconds)
        for (const [path, url] of Object.entries(signed)) {
          entries.set(path, { url, expiresAt: requestedAt + ttlSeconds * 1000 })
        }
      }
      const result: Record<string, string> = {}
      for (const path of paths) {
        const url = fresh(path)
        if (url) result[path] = url
      }
      return result
    },
    forget: (path: string) => void entries.delete(path),
  }
}
