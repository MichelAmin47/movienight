import { describe, expect, it } from 'vitest'
import { isNetworkError } from './network'

describe('isNetworkError', () => {
  it('recognises the fetch failures of the big browsers', () => {
    expect(isNetworkError('TypeError: Failed to fetch')).toBe(true)
    expect(isNetworkError('NetworkError when attempting to fetch resource.')).toBe(true)
    expect(isNetworkError('Load failed')).toBe(true)
  })

  it('leaves errors from the server alone', () => {
    expect(isNetworkError('permission denied for table watches')).toBe(false)
    expect(isNetworkError('JWT expired')).toBe(false)
  })
})
