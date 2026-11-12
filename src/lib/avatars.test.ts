import { describe, expect, it, vi } from 'vitest'
import { clampCrop, cropRect, initialCrop, panCrop } from './avatarCrop'
import { createSignedUrlCache } from './signedUrlCache'

describe('avatar crop', () => {
  const landscape = { width: 4000, height: 3000 }

  it('starts with the largest centred square', () => {
    expect(cropRect(landscape, initialCrop(landscape))).toEqual({ x: 500, y: 0, side: 3000 })
  })

  it('keeps the square inside the image', () => {
    const crop = clampCrop(landscape, { cx: -100, cy: 99999, zoom: 2 })
    expect(cropRect(landscape, crop)).toEqual({ x: 0, y: 1500, side: 1500 })
  })

  it('limits the zoom range', () => {
    expect(clampCrop(landscape, { cx: 2000, cy: 1500, zoom: 0.2 }).zoom).toBe(1)
    expect(clampCrop(landscape, { cx: 2000, cy: 1500, zoom: 99 }).zoom).toBe(5)
  })

  it('pans in image pixels, opposite to the drag', () => {
    // 3000 source px over a 300 px viewport: 10 source px per screen px.
    const crop = panCrop(landscape, initialCrop(landscape), 20, 5, 300)
    expect(crop.cx).toBe(1800)
    expect(crop.cy).toBe(1500) // no vertical room at zoom 1
  })
})

describe('signed url cache', () => {
  function setup() {
    let time = 0
    const sign = vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, `${p}?t=${time}`])),
    )
    const cache = createSignedUrlCache(sign, { ttlSeconds: 3600, marginSeconds: 300, now: () => time })
    return { cache, sign, advance: (seconds: number) => (time += seconds * 1000) }
  }

  it('signs all paths in one batch and reuses them', async () => {
    const { cache, sign } = setup()
    expect(await cache.get(['a', 'b'])).toEqual({ a: 'a?t=0', b: 'b?t=0' })
    await cache.get(['a', 'b'])
    expect(sign).toHaveBeenCalledTimes(1)
    expect(sign).toHaveBeenCalledWith(['a', 'b'], 3600)
  })

  it('only signs paths it does not have yet', async () => {
    const { cache, sign } = setup()
    await cache.get(['a'])
    await cache.get(['a', 'b'])
    expect(sign).toHaveBeenLastCalledWith(['b'], 3600)
  })

  it('refreshes shortly before expiry', async () => {
    const { cache, sign, advance } = setup()
    await cache.get(['a'])
    advance(3200)
    expect(cache.isStale(['a'])).toBe(false)
    advance(200)
    expect(cache.isStale(['a'])).toBe(true)
    expect(await cache.get(['a'])).toEqual({ a: 'a?t=3400000' })
    expect(sign).toHaveBeenCalledTimes(2)
  })

  it('leaves out paths that could not be signed', async () => {
    const cache = createSignedUrlCache(async () => ({}))
    expect(await cache.get(['missing'])).toEqual({})
  })
})
