/**
 * Pure geometry for the square avatar crop. The crop is described in source
 * image pixels: the point of the image shown at the centre of the viewport
 * and a zoom factor, where 1 means the shortest image side exactly fills it.
 */
export type Crop = { cx: number; cy: number; zoom: number }
export type Size = { width: number; height: number }

export const AVATAR_SIZE = 256
export const MIN_ZOOM = 1
export const MAX_ZOOM = 5

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Side of the visible source square, in image pixels. */
export function cropSide(image: Size, zoom: number): number {
  return Math.min(image.width, image.height) / zoom
}

/** Keeps the zoom in range and the visible square inside the image. */
export function clampCrop(image: Size, crop: Crop): Crop {
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM)
  const half = cropSide(image, zoom) / 2
  return {
    zoom,
    cx: clamp(crop.cx, half, image.width - half),
    cy: clamp(crop.cy, half, image.height - half),
  }
}

export function initialCrop(image: Size): Crop {
  return { cx: image.width / 2, cy: image.height / 2, zoom: MIN_ZOOM }
}

/** Moves the image under the viewport by a drag of (dx, dy) screen pixels. */
export function panCrop(image: Size, crop: Crop, dx: number, dy: number, viewport: number): Crop {
  const perPixel = cropSide(image, crop.zoom) / viewport
  return clampCrop(image, { ...crop, cx: crop.cx - dx * perPixel, cy: crop.cy - dy * perPixel })
}

/** Source rectangle to draw onto the square output canvas. */
export function cropRect(image: Size, crop: Crop): { x: number; y: number; side: number } {
  const c = clampCrop(image, crop)
  const side = cropSide(image, c.zoom)
  return { x: c.cx - side / 2, y: c.cy - side / 2, side }
}
