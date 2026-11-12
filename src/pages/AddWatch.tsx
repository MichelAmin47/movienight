import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BackLink, MovieHeader } from '../components/MovieHeader'
import { Button, Card, ErrorNote, Spinner } from '../components/ui'
import { WatchForm, type WatchFormValues } from '../components/WatchForm'
import { t } from '../i18n/strings'
import type { Movie } from '../lib/database.types'
import { ensureMovie } from '../lib/tmdb'
import { createWatch } from '../lib/watches'
import { useHousehold } from '../state/household'

/** Second step of the add flow: the chosen movie with date and stars. */
export function AddWatch() {
  const tmdbId = Number(useParams().tmdbId)
  const navigate = useNavigate()
  const { household, refresh } = useHousehold()
  const [movie, setMovie] = useState<Movie | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Also stores the movie in the shared `movies` table, which the watch row references.
    ensureMovie(tmdbId)
      .then((m) => !cancelled && setMovie(m))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [tmdbId, attempt])

  async function save(values: WatchFormValues) {
    if (!household) return
    const watchId = await createWatch(household.id, tmdbId, values)
    await refresh()
    navigate(`/watch/${watchId}`, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink onClick={() => navigate(-1)} />
      {failed ? (
        <>
          <ErrorNote>{t.common.genericError}</ErrorNote>
          <Button
            onClick={() => {
              setFailed(false)
              setAttempt((n) => n + 1)
            }}
          >
            {t.common.retry}
          </Button>
        </>
      ) : !movie ? (
        <Spinner />
      ) : (
        <>
          <MovieHeader movie={movie}>
            <p className="font-bold text-accent">{t.watchForm.addTitle}</p>
          </MovieHeader>
          <Card>
            <WatchForm onSubmit={save} />
          </Card>
        </>
      )}
    </div>
  )
}
