import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { t } from '../i18n/strings'
import { clampCrop, cropSide, initialCrop, MAX_ZOOM, MIN_ZOOM, panCrop, type Crop } from '../lib/avatarCrop'
import { Button } from './ui'

type Point = { x: number; y: number }

/**
 * Full-screen step to frame a photo inside a circle: drag to move, pinch,
 * scroll or use the slider to zoom. Reports the crop in image pixels.
 */
export function AvatarCropper({
  image,
  busy,
  onCancel,
  onConfirm,
}: {
  image: HTMLImageElement
  busy: boolean
  onCancel: () => void
  onConfirm: (crop: Crop) => void
}) {
  const size = { width: image.naturalWidth, height: image.naturalHeight }
  const [crop, setCrop] = useState<Crop>(() => initialCrop(size))
  const viewport = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const zoomTo = (zoom: number) => setCrop((c) => clampCrop(size, { ...c, zoom }))

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(e.pointerId)
    const width = viewport.current?.clientWidth
    if (!previous || !width) return
    const next = { x: e.clientX, y: e.clientY }
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId)
    pointers.current.set(e.pointerId, next)

    if (others.length === 0) {
      setCrop((c) => panCrop(size, c, next.x - previous.x, next.y - previous.y, width))
      return
    }
    // Pinch: zoom by how much the two fingers moved apart, pan by half the move.
    const other = others[0][1]
    const before = Math.hypot(previous.x - other.x, previous.y - other.y)
    const after = Math.hypot(next.x - other.x, next.y - other.y)
    setCrop((c) => {
      const zoomed = before > 0 ? clampCrop(size, { ...c, zoom: (c.zoom * after) / before }) : c
      return panCrop(size, zoomed, (next.x - previous.x) / 2, (next.y - previous.y) / 2, width)
    })
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    const factor = Math.exp(-e.deltaY / 400)
    setCrop((c) => clampCrop(size, { ...c, zoom: c.zoom * factor }))
  }

  // Everything is laid out in percentages of the square viewport.
  const side = cropSide(size, crop.zoom)
  const imageStyle = {
    width: `${(size.width / side) * 100}%`,
    height: `${(size.height / side) * 100}%`,
    left: `${(-(crop.cx - side / 2) / side) * 100}%`,
    top: `${(-(crop.cy - side / 2) / side) * 100}%`,
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.people.cropTitle}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto overscroll-contain bg-black/90 p-4 text-white"
    >
      <div className="text-center">
        <h2 className="text-xl font-extrabold">{t.people.cropTitle}</h2>
        <p className="text-sm text-white/75">{t.people.cropHint}</p>
      </div>
      <div
        ref={viewport}
        data-testid="crop-viewport"
        className="relative aspect-square w-[min(80vw,20rem)] shrink-0 cursor-grab touch-none overflow-hidden rounded-2xl bg-black select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
      >
        <img src={image.src} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={imageStyle} />
        {/* Circle window: the huge shadow dims everything outside it. */}
        <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.6)] ring-2 ring-white/90 ring-inset" />
      </div>
      <label className="flex w-[min(80vw,20rem)] items-center gap-3 text-sm font-bold">
        {t.people.cropZoom}
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          onChange={(e) => zoomTo(Number(e.target.value))}
          className="min-h-11 flex-1 accent-accent"
        />
      </label>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => onConfirm(crop)}>
          {t.people.cropConfirm}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  )
}
