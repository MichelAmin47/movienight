import { AVATAR_SIZE, cropRect, type Crop } from './avatarCrop'
import { createSignedUrlCache } from './signedUrlCache'
import { supabase } from './supabase'

const BUCKET = 'avatars'

/** Signed URLs for the private avatars bucket, cached in memory for ~1 hour. */
export const avatarUrlCache = createSignedUrlCache(async (paths, expiresIn) => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn)
  if (error) throw error
  const urls: Record<string, string> = {}
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl
  }
  return urls
})

/** Thrown when the browser cannot decode the chosen file (e.g. HEIC on most non-Apple browsers). */
export class UnsupportedImageError extends Error {}

/** Decodes a picked file into an image element; the caller revokes `image.src` when done. */
export async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = URL.createObjectURL(file)
  try {
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('empty image')
    return image
  } catch {
    URL.revokeObjectURL(image.src)
    throw new UnsupportedImageError()
  }
}

/**
 * Renders the cropped square at 256×256. WebP where the browser can encode it;
 * browsers that cannot (Safari falls back to PNG) get a JPEG instead.
 */
export async function renderAvatar(image: HTMLImageElement, crop: Crop): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas unavailable')
  const { x, y, side } = cropRect({ width: image.naturalWidth, height: image.naturalHeight }, crop)
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, x, y, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
  const webp = await encode('image/webp')
  if (webp?.type === 'image/webp') return webp
  const jpeg = await encode('image/jpeg')
  if (!jpeg) throw new Error('could not encode avatar')
  return jpeg
}

/** Uploads a processed avatar and returns its path inside the bucket. */
export async function uploadAvatar(householdId: string, personId: string, blob: Blob): Promise<string> {
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg'
  // The timestamp makes every upload a new object, so no stale cached image.
  const path = `${householdId}/${personId}-${Date.now()}.${extension}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
  if (error) throw error
  return path
}

/** Best effort: a leftover object is harmless, so failures are not surfaced. */
export async function deleteAvatar(path: string): Promise<void> {
  avatarUrlCache.forget(path)
  try {
    await supabase.storage.from(BUCKET).remove([path])
  } catch {
    // ignore
  }
}
