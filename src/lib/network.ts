/**
 * Whether an error message is the browser's "request never got through":
 * "Failed to fetch" (Chrome), "NetworkError when attempting to fetch resource"
 * (Firefox), "Load failed" (Safari). `navigator.onLine` alone is not enough: it
 * stays true on a network without internet.
 */
export function isNetworkError(message: string): boolean {
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message)
}
