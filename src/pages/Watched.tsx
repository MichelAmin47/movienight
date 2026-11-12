import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PersonBadge } from '../components/PersonBadge'
import { Poster } from '../components/Poster'
import { Chip, PageTitle } from '../components/ui'
import { t } from '../i18n/strings'
import { average, formatScore } from '../lib/format'
import { useHousehold, type WatchEntry } from '../state/household'

type Sort = 'date' | 'score'

/** Score shown for a watch: one person's score when filtered, otherwise the average. */
function scoreOf(watch: WatchEntry, personId: string | null): number | null {
  if (personId) return watch.ratings.find((r) => r.person_id === personId)?.score ?? null
  return average(watch.ratings.map((r) => r.score))
}

export function Watched() {
  const { watches, people } = useHousehold()
  const [sort, setSort] = useState<Sort>('date')
  const [personId, setPersonId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const rows = watches
      .map((watch) => ({ watch, score: scoreOf(watch, personId) }))
      .filter((row) => !personId || row.score !== null)
    // `watches` arrives newest first; a stable sort keeps that order within equal scores.
    if (sort === 'score') rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return rows
  }, [watches, sort, personId])

  if (watches.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 pt-16 text-center">
        <div className="text-6xl" aria-hidden>
          🍿
        </div>
        <p className="max-w-xs text-lg text-muted">{t.watched.empty}</p>
        <Link
          to="/add"
          className="inline-flex min-h-12 items-center rounded-2xl bg-accent px-5 font-bold text-on-accent"
        >
          {t.watched.addFirst}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <PageTitle>{t.watched.title}</PageTitle>
        <span className="text-sm text-muted">{t.watched.count(visible.length)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2" role="group" aria-label={t.watched.sortLabel}>
          <span className="text-sm font-bold text-muted">{t.watched.sortLabel}</span>
          <Chip selected={sort === 'date'} onClick={() => setSort('date')}>
            {t.watched.sortDate}
          </Chip>
          <Chip selected={sort === 'score'} onClick={() => setSort('score')}>
            {t.watched.sortScore}
          </Chip>
        </div>
        {people.length > 1 && (
          <div
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
            role="group"
            aria-label={t.watched.filterLabel}
          >
            <Chip selected={personId === null} onClick={() => setPersonId(null)}>
              {t.common.everyone}
            </Chip>
            {people.map((person) => (
              <Chip key={person.id} selected={personId === person.id} onClick={() => setPersonId(person.id)}>
                <PersonBadge person={person} size="sm" />
                {person.name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-muted">{t.watched.emptyFiltered}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {visible.map(({ watch, score }) => (
            <li key={watch.id}>
              <Link to={`/watch/${watch.id}`} className="group flex flex-col gap-1.5">
                <div className="relative">
                  <Poster
                    path={watch.movie.poster_path}
                    title={watch.movie.title}
                    className="transition-transform group-hover:scale-[1.02]"
                  />
                  {score !== null && (
                    <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/75 px-2 py-0.5 text-sm font-bold text-white">
                      <span className="text-[#f5bd4a]" aria-hidden>
                        ★
                      </span>{' '}
                      {formatScore(score)}
                    </span>
                  )}
                </div>
                <span className="line-clamp-2 text-sm leading-tight font-bold">{watch.movie.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
