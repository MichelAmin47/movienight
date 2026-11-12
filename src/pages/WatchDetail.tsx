import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BackLink, MovieHeader } from '../components/MovieHeader'
import { PersonBadge } from '../components/PersonBadge'
import { StarsDisplay } from '../components/Stars'
import { Button, Card, ErrorNote } from '../components/ui'
import { WatchForm, type WatchFormValues } from '../components/WatchForm'
import { t } from '../i18n/strings'
import { average, formatDate, formatScore } from '../lib/format'
import { deleteWatch, updateWatch } from '../lib/watches'
import { useHousehold } from '../state/household'

export function WatchDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { watches, people, refresh } = useHousehold()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState(false)

  const watch = watches.find((w) => w.id === id)
  if (!watch) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink onClick={() => navigate('/')} />
        <p className="text-muted">{t.detail.notFound}</p>
      </div>
    )
  }

  const { movie, ratings } = watch
  const avg = average(ratings.map((r) => r.score))
  const others = watches.filter((w) => w.tmdb_id === watch.tmdb_id && w.id !== watch.id)

  async function save(values: WatchFormValues) {
    await updateWatch(
      watch!.id,
      values,
      ratings.map((r) => r.person_id),
    )
    await refresh()
    setEditing(false)
  }

  async function remove() {
    if (!window.confirm(t.detail.confirmDelete)) return
    try {
      await deleteWatch(watch!.id)
      navigate('/', { replace: true })
      await refresh()
    } catch {
      setError(true)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink onClick={() => navigate('/')} />
      <MovieHeader movie={movie}>
        <p className="text-sm text-muted">{t.detail.watchedOn(formatDate(watch.watched_on))}</p>
        {avg !== null && (
          <p className="flex items-center gap-2 text-lg font-extrabold">
            <StarsDisplay value={avg} className="text-xl" />
            <span>
              {formatScore(avg)} <span className="sr-only">{t.detail.average}</span>
            </span>
          </p>
        )}
      </MovieHeader>

      {error && <ErrorNote>{t.common.genericError}</ErrorNote>}

      {editing ? (
        <Card>
          <h2 className="mb-4 text-lg font-extrabold">{t.watchForm.editTitle}</h2>
          <WatchForm
            initial={{
              watchedOn: watch.watched_on,
              note: watch.note ?? '',
              scores: Object.fromEntries(ratings.map((r) => [r.person_id, r.score])),
            }}
            onSubmit={save}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            {ratings.length === 0 ? (
              <p className="text-muted">{t.detail.noScores}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {people
                  .map((person) => ({ person, rating: ratings.find((r) => r.person_id === person.id) }))
                  .filter((row) => row.rating)
                  .map(({ person, rating }) => (
                    <li key={person.id} className="flex items-center gap-3">
                      <PersonBadge person={person} />
                      <span className="min-w-0 flex-1 truncate font-bold">{person.name}</span>
                      <StarsDisplay value={rating!.score} className="text-2xl" />
                      <span className="sr-only">{t.watchForm.starLabel(person.name, rating!.score)}</span>
                    </li>
                  ))}
              </ul>
            )}
            {watch.note && <p className="rounded-2xl bg-raised px-4 py-3 italic">“{watch.note}”</p>}
          </Card>

          {movie.overview && <p className="text-muted">{movie.overview}</p>}

          {others.length > 0 && (
            <div>
              <h2 className="mb-1 text-sm font-bold text-muted">{t.detail.otherViewings}</h2>
              <ul className="flex flex-wrap gap-2">
                {others.map((other) => (
                  <li key={other.id}>
                    <Link
                      to={`/watch/${other.id}`}
                      className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-bold"
                    >
                      {formatDate(other.watched_on)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button className="flex-1" onClick={() => setEditing(true)}>
              {t.common.edit}
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/add/${watch.tmdb_id}`)}>
              {t.detail.watchAgain}
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              {t.common.delete}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
