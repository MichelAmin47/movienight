import { t } from '../i18n/strings'
import { genreLabels } from '../lib/useGenres'

/**
 * A movie's genres as small chips. With `max`, only the first few are shown
 * and the rest is summarised as "+n" (the full list is in its `title`).
 */
export function GenreChips({
  genreIds,
  names,
  max,
}: {
  genreIds: number[]
  names: Record<number, string> | null
  max?: number
}) {
  const labels = genreLabels(genreIds, names)
  if (labels.length === 0) return null
  const shown = max === undefined ? labels : labels.slice(0, max)
  const hidden = labels.slice(shown.length)
  const chip = 'rounded-full border border-line px-2 py-0.5 text-xs font-bold text-muted'
  return (
    <ul aria-label={t.movie.genres} className="flex flex-wrap gap-1.5">
      {shown.map((label) => (
        <li key={label} className={chip}>
          {label}
        </li>
      ))}
      {hidden.length > 0 && (
        <li className={chip} title={hidden.join(', ')} aria-label={hidden.join(', ')}>
          {t.movie.moreGenres(hidden.length)}
        </li>
      )}
    </ul>
  )
}
