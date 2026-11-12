import { posterUrl } from '../lib/tmdb'

/** Movie poster in the standard 2:3 ratio, with a titled placeholder when TMDB has none. */
export function Poster({
  path,
  title,
  size = 'w342',
  className = '',
}: {
  path: string | null
  title: string
  size?: 'w154' | 'w342' | 'w500'
  className?: string
}) {
  const url = posterUrl(path, size)
  return (
    <div className={`aspect-[2/3] overflow-hidden rounded-2xl bg-raised ${className}`}>
      {url ? (
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs font-bold text-muted">
          <span className="text-2xl" aria-hidden>
            🎞️
          </span>
          <span className="line-clamp-3">{title}</span>
        </div>
      )}
    </div>
  )
}
