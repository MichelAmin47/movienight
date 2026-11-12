import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { t } from '../i18n/strings'
import {
  centeredIndex,
  easeOutCubic,
  pickRandomIndex,
  repositionAfterChange,
  ringWindow,
  spinPlan,
} from '../lib/carousel'
import { Poster } from './Poster'

export type CarouselItem = { key: string; title: string; posterPath: string | null }

/** Angle between two neighbouring posters; 15 slots make a full ring. */
const STEP_DEG = 24
const SPIN_MS = 3600
const SNAP_MS = 260
/** Pointer travel (px) before a press counts as a drag instead of a tap. */
const DRAG_THRESHOLD = 8
/** Distance between two poster centres on screen, as a fraction of the poster width. */
const SLOT_WIDTH = 0.77
const CONFETTI_COLORS = ['var(--accent)', 'var(--star)', 'var(--good)', '#5b8def', '#c56cf0']

type Confetti = { id: number; dx: number; dy: number; rotate: number; delay: number; color: string }

function makeConfetti(): Confetti[] {
  return Array.from({ length: 18 }, (_, id) => {
    const angle = Math.random() * Math.PI * 2
    const distance = 70 + Math.random() * 110
    return {
      id,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 40,
      rotate: (Math.random() - 0.5) * 720,
      delay: Math.random() * 120,
      color: CONFETTI_COLORS[id % CONFETTI_COLORS.length],
    }
  })
}

function vibrate(pattern: number | number[]) {
  // Android only in practice; iOS Safari has no Vibration API.
  if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Cover-flow style ring of posters with drag, arrow buttons and a spin
 * button that lands on a random item. `children` renders the card for the
 * centred item; `onOpen` is called when the centred poster is tapped.
 */
export function Carousel({
  items,
  onOpen,
  spinDisabled = false,
  onSpinChange,
  children,
}: {
  items: CarouselItem[]
  onOpen: (index: number) => void
  /** Blocks the spin button, e.g. while the list is still loading. */
  spinDisabled?: boolean
  /** Told when a spin starts and ends, so the page can leave the list alone meanwhile. */
  onSpinChange?: (spinning: boolean) => void
  children: (index: number) => ReactNode
}) {
  const count = items.length
  const keys = items.map((item) => item.key)
  const signature = keys.join('\n')

  /** Ring position in posters; fractional while moving, unbounded while spinning. */
  const [position, setPosition] = useState(0)
  const [known, setKnown] = useState({ signature, keys })
  const [spinning, setSpinning] = useState(false)
  const [winnerKey, setWinnerKey] = useState<string | null>(null)
  const [confetti, setConfetti] = useState<Confetti[] | null>(null)
  /** Bumped when a result is shown without a spin (reduced motion), to replay the fade. */
  const [fade, setFade] = useState(0)

  const frame = useRef(0)
  const drag = useRef<{ id: number; startX: number; startPosition: number; slotPx: number; moved: boolean; lastX: number; lastTime: number; velocity: number } | null>(null)
  /** True right after a drag, so the click that ends it is not treated as a tap. */
  const suppressClick = useRef(false)
  const stage = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)

  // The list changed (filter, sort, shuffle, dismiss): stay on the same movie when possible.
  if (known.signature !== signature) {
    setKnown({ signature, keys })
    setPosition(repositionAfterChange(position, known.keys, keys))
    setSpinning(false)
    setConfetti(null)
    if (winnerKey !== null && !keys.includes(winnerKey)) setWinnerKey(null)
  }
  useEffect(() => onSpinChange?.(spinning), [spinning, onSpinChange])
  // ...and stop any animation that was heading for a place in the old list.
  useEffect(() => () => cancelAnimationFrame(frame.current), [signature])

  function animate(from: number, to: number, duration: number, onFrame?: (value: number) => void, onDone?: () => void) {
    cancelAnimationFrame(frame.current)
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const value = from + (to - from) * easeOutCubic(progress)
      if (progress < 1) {
        setPosition(value)
        onFrame?.(value)
        frame.current = requestAnimationFrame(tick)
      } else {
        // Back into 0..count-1 so the position does not grow forever.
        setPosition(centeredIndex(to, count))
        onDone?.()
      }
    }
    frame.current = requestAnimationFrame(tick)
  }

  function clearWinner() {
    setWinnerKey(null)
    setConfetti(null)
  }

  /** Manual move (arrows, tap on a neighbour, end of a drag). */
  function glideTo(target: number, from = position) {
    if (spinning || count === 0) return
    clearWinner()
    if (prefersReducedMotion()) setPosition(centeredIndex(target, count))
    else animate(from, target, SNAP_MS)
  }

  function spin() {
    if (spinning || spinDisabled || count === 0) return
    const winner = pickRandomIndex(count)
    const finish = (celebrate: boolean) => {
      setSpinning(false)
      setWinnerKey(items[winner].key)
      setConfetti(celebrate ? makeConfetti() : null)
      vibrate([20, 50, 40])
      // Wait for the card to render before bringing it into view.
      requestAnimationFrame(() => card.current?.scrollIntoView({ block: 'nearest', behavior: celebrate ? 'smooth' : 'auto' }))
    }
    clearWinner()
    if (prefersReducedMotion()) {
      setPosition(winner)
      setFade((n) => n + 1)
      finish(false)
      return
    }
    const { from, to } = spinPlan({ position, count, winner })
    setSpinning(true)
    vibrate(10)
    let lastTick = Math.round(from)
    let lastTickTime = 0
    animate(
      from,
      to,
      SPIN_MS,
      (value) => {
        // A light tick per poster passing the centre, throttled while the ring is fast.
        const passed = Math.round(value)
        const now = performance.now()
        if (passed !== lastTick && now - lastTickTime > 70) {
          lastTick = passed
          lastTickTime = now
          vibrate(6)
        }
      },
      () => finish(true),
    )
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false
    if (spinning || count < 2 || (event.pointerType === 'mouse' && event.button !== 0)) return
    cancelAnimationFrame(frame.current)
    const posterWidth = stage.current?.querySelector<HTMLElement>('[data-slot]')?.offsetWidth ?? 160
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startPosition: position,
      slotPx: posterWidth * SLOT_WIDTH,
      moved: false,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    const dx = event.clientX - current.startX
    if (!current.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      current.moved = true
      suppressClick.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      clearWinner()
    }
    const elapsed = event.timeStamp - current.lastTime
    if (elapsed > 0) current.velocity = (event.clientX - current.lastX) / elapsed
    current.lastX = event.clientX
    current.lastTime = event.timeStamp
    setPosition(current.startPosition - dx / current.slotPx)
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    drag.current = null
    const released = current.startPosition - (event.clientX - current.startX) / current.slotPx
    if (!current.moved) {
      // A press that interrupted a glide: settle on the nearest poster.
      if (!Number.isInteger(position)) glideTo(Math.round(position))
      return
    }
    // A flick carries on for a few posters; a slow drag just snaps to the nearest one.
    const stale = event.timeStamp - current.lastTime > 80
    const throwSlots = stale ? 0 : Math.max(-3, Math.min(3, (-current.velocity * 160) / current.slotPx))
    glideTo(Math.round(released + throwSlots), released)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') glideTo(Math.round(position) - 1)
    else if (event.key === 'ArrowRight') glideTo(Math.round(position) + 1)
    else return
    event.preventDefault()
  }

  if (count === 0) return null

  const current = centeredIndex(position, count)
  const slots = ringWindow(position, count)
  const half = (slots.length - 1) / 2
  const settled = !spinning && Number.isInteger(position)
  const isWinner = settled && winnerKey === items[current].key

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={stage}
        role="group"
        aria-roledescription="carousel"
        aria-label={t.carousel.label}
        className="carousel-stage relative -mx-4 touch-pan-y overflow-hidden select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        {isWinner && <div aria-hidden className="carousel-glow" />}
        <div key={fade} className={`carousel-perspective ${fade > 0 ? 'carousel-fade' : ''}`}>
          <div className="carousel-ring">
          {slots.map(({ slot, index, offset }) => {
            const item = items[index]
            const distance = Math.abs(offset)
            const centered = settled && index === current && distance === 0
            // Posters overlap like a cover flow: the centred one comes forward and every
            // next one sits a little deeper, so each tucks in behind its inner neighbour.
            const depth = 0.4 * Math.max(0, 1 - distance) - 0.2 * Math.min(distance, 4)
            const style: CSSProperties = {
              transform: `rotateY(${offset * STEP_DEG}deg) translateZ(calc(var(--carousel-radius) + var(--carousel-poster) * ${depth}))`,
              // The outermost slots fade out, so posters entering and leaving the window never pop.
              opacity: Math.max(0, Math.min(1, half + 0.5 - distance)),
            }
            return (
              <button
                key={slot}
                type="button"
                data-slot
                tabIndex={centered ? 0 : -1}
                aria-hidden={!centered}
                aria-label={t.carousel.open(item.title)}
                className="carousel-slot"
                style={style}
                onClick={() => {
                  if (suppressClick.current || spinning) return
                  if (centered) onOpen(index)
                  else glideTo(slot)
                }}
              >
                <Poster
                  path={item.posterPath}
                  title={item.title}
                  className={`pointer-events-none ${centered && isWinner ? 'carousel-winner' : ''}`}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl bg-black"
                  style={{ opacity: Math.min(0.65, distance * 0.3) }}
                />
              </button>
            )
          })}
          </div>
        </div>
        {confetti && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {confetti.map((piece) => (
              <span
                key={piece.id}
                className="carousel-confetti"
                style={
                  {
                    background: piece.color,
                    animationDelay: `${piece.delay}ms`,
                    '--dx': `${piece.dx}px`,
                    '--dy': `${piece.dy}px`,
                    '--rotate': `${piece.rotate}deg`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-5">
        <button
          type="button"
          aria-label={t.carousel.previous}
          disabled={spinning || count < 2}
          onClick={() => glideTo(Math.round(position) - 1)}
          className="flex size-12 items-center justify-center rounded-full bg-raised text-2xl font-bold text-ink hover:bg-line disabled:opacity-40"
        >
          <span aria-hidden>‹</span>
        </button>
        <button
          type="button"
          disabled={spinning || spinDisabled}
          onClick={spin}
          className="flex size-24 flex-col items-center justify-center rounded-full bg-accent font-extrabold text-on-accent shadow-lg transition-transform hover:bg-accent-strong active:scale-95 disabled:opacity-60"
        >
          <span aria-hidden className={`text-3xl leading-none ${spinning ? 'animate-spin' : ''}`}>
            🎲
          </span>
          {t.carousel.spin}
        </button>
        <button
          type="button"
          aria-label={t.carousel.next}
          disabled={spinning || count < 2}
          onClick={() => glideTo(Math.round(position) + 1)}
          className="flex size-12 items-center justify-center rounded-full bg-raised text-2xl font-bold text-ink hover:bg-line disabled:opacity-40"
        >
          <span aria-hidden>›</span>
        </button>
      </div>

      <div ref={card} aria-live="polite" className="scroll-mb-28">
        {settled && (
          <section
            className={`flex flex-col gap-2 rounded-3xl border bg-surface p-4 ${
              isWinner ? 'carousel-fade border-star' : 'border-line'
            }`}
          >
            <p className="flex items-center justify-between gap-2 text-sm font-bold text-muted">
              {isWinner ? <span className="text-accent">🎉 {t.carousel.winner}</span> : <span />}
              <span>{t.carousel.position(current + 1, count)}</span>
            </p>
            {children(current)}
          </section>
        )}
      </div>
    </div>
  )
}
