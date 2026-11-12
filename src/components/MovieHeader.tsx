import type { ReactNode } from 'react'
import { t } from '../i18n/strings'
import type { Movie } from '../lib/database.types'
import { Poster } from './Poster'

/** Poster beside title, year, runtime and certification. */
export function MovieHeader({ movie, children }: { movie: Movie; children?: ReactNode }) {
  const facts = [
    movie.year,
    movie.runtime ? t.common.minutes(movie.runtime) : null,
    movie.certification_nl ? t.suggestions.ageLabel(movie.certification_nl) : null,
  ].filter(Boolean)
  return (
    <header className="flex gap-4">
      <Poster path={movie.poster_path} title={movie.title} className="w-28 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-extrabold text-balance">{movie.title}</h1>
        {facts.length > 0 && <p className="text-muted">{facts.join(' · ')}</p>}
        {children}
      </div>
    </header>
  )
}

export function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start px-2 font-bold text-muted">
      ‹ {t.common.back}
    </button>
  )
}
