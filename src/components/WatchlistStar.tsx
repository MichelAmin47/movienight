import { useEffect, useState } from 'react'
import { t } from '../i18n/strings'
import { useHousehold } from '../state/household'
import { Toast } from './ui'

const ERROR_MS = 4000

/**
 * Star toggle for "Willen we zien". Changes at once; when saving fails the
 * star goes back and a short message is shown. With `labelled` it is a
 * button with text, otherwise a round icon button.
 */
export function WatchlistStar({
  tmdbId,
  title,
  labelled = false,
  className = '',
}: {
  tmdbId: number
  title: string
  labelled?: boolean
  className?: string
}) {
  const { watchlistIds, toggleWatchlist } = useHousehold()
  const [failed, setFailed] = useState(false)
  const on = watchlistIds.has(tmdbId)

  useEffect(() => {
    if (!failed) return
    const timer = window.setTimeout(() => setFailed(false), ERROR_MS)
    return () => window.clearTimeout(timer)
  }, [failed])

  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        aria-label={on ? t.watchlist.remove(title) : t.watchlist.add(title)}
        title={t.watchlist.toggle}
        onClick={() => {
          setFailed(false)
          void toggleWatchlist(tmdbId).then((saved) => setFailed(!saved))
        }}
        className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl text-sm font-bold transition-colors ${
          labelled ? 'bg-raised px-4 text-ink hover:bg-line' : 'min-w-11 hover:bg-raised'
        } ${className}`}
      >
        <span aria-hidden className={`text-2xl leading-none ${on ? 'text-star' : 'text-muted'}`}>
          {on ? '★' : '☆'}
        </span>
        {labelled && t.watchlist.toggle}
      </button>
      {failed && <Toast>{t.watchlist.saveError}</Toast>}
    </>
  )
}
