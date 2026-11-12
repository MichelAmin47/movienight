import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { Carousel, type CarouselItem } from '../components/Carousel'
import { PersonFilter } from '../components/PersonFilter'
import { Poster } from '../components/Poster'
import { Button, ErrorNote, PageTitle } from '../components/ui'
import { ViewSwitcher } from '../components/ViewSwitcher'
import { t } from '../i18n/strings'
import type { Person } from '../lib/database.types'
import { usePrefs, useViewMode, type ViewMode } from '../lib/prefs'
import { ratedMovies, sourceMovies } from '../lib/suggestions'
import { supabase } from '../lib/supabase'
import { TipsStore, type Tip } from '../lib/tipsStore'
import { discoverMovies, ensureMovies, getGenres, getRecommendations, releaseYear } from '../lib/tmdb'
import { useHousehold } from '../state/household'

/** How long a dismissed tile takes to fade out (matches `duration-200`). */
const FADE_MS = 200
/** Scrolled further than this (px) counts as "reading the list": it is then not swapped. */
const SCROLLED_DOWN = 120

function browserStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return window[kind]
  } catch {
    return null
  }
}

function explanation(tip: Tip, person: Person | null): string {
  if (tip.explanation.kind === 'genre') {
    const { genre } = tip.explanation
    if (!genre) return t.suggestions.becauseGenres
    return person
      ? t.suggestions.becauseGenrePerson(person.name, genre.toLowerCase())
      : t.suggestions.becauseGenre(genre.toLowerCase())
  }
  const joined = tip.explanation.titles.join(` ${t.suggestions.and} `)
  return person ? t.suggestions.becausePerson(person.name, joined) : t.suggestions.because(joined)
}

/** Placeholder in the shape of the list, shown until the first complete list is ready. */
function TipsSkeleton({ view }: { view: ViewMode }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <p className="text-center text-muted">{t.suggestions.loading}</p>
      {view === 'carousel' ? (
        <div aria-hidden className="flex animate-pulse flex-col items-center gap-4">
          <div className="flex items-center justify-center gap-3 py-4">
            <div className="aspect-[2/3] w-24 rounded-2xl bg-raised opacity-60" />
            <div className="aspect-[2/3] w-36 rounded-2xl bg-raised" />
            <div className="aspect-[2/3] w-24 rounded-2xl bg-raised opacity-60" />
          </div>
          <div className="size-24 rounded-full bg-raised" />
          <div className="h-32 w-full rounded-3xl bg-raised" />
        </div>
      ) : (
        <ol aria-hidden className="flex animate-pulse flex-col gap-3">
          {[0, 1, 2, 3].map((n) => (
            <li key={n} className="flex gap-3 rounded-3xl border border-line bg-surface p-3">
              <div className="aspect-[2/3] w-24 shrink-0 rounded-2xl bg-raised" />
              <div className="flex flex-1 flex-col gap-2 py-1">
                <div className="h-5 w-2/3 rounded-full bg-raised" />
                <div className="h-4 w-1/3 rounded-full bg-raised" />
                <div className="h-4 w-full rounded-full bg-raised" />
                <div className="h-4 w-5/6 rounded-full bg-raised" />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function Suggestions() {
  const { household, watches, people, dismissed, refresh } = useHousehold()
  const [prefs, setPrefs] = usePrefs()
  const [view, setView] = useViewMode('suggestions')
  /** Carousel view: the movie whose "more info" is open. */
  const [infoId, setInfoId] = useState<number | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  /** Dismissed tiles that are fading out. */
  const [leaving, setLeaving] = useState<number[]>([])
  /** Tips that took the place of a dismissed one; they fade in. */
  const [entered, setEntered] = useState<number[]>([])
  // The store computes every list completely before publishing it, so what is
  // rendered below only ever changes in one go.
  const [store] = useState(
    () =>
      new TipsStore({
        getRecommendations,
        ensureMovies,
        discoverMovies,
        getGenres,
        storage: browserStorage('localStorage'),
        recentStorage: browserStorage('sessionStorage'),
        rng: Math.random,
        canSwap: () => window.scrollY <= SCROLLED_DOWN,
      }),
  )
  const { list, staged, computing, shuffling, error } = useSyncExternalStore(store.subscribe, store.getState)

  // A spinning carousel must not get another list under it.
  const onSpinChange = useCallback((spinning: boolean) => store.hold(spinning), [store])

  const householdId = household?.id
  // Before paint, so a cached list is on screen in the very first frame.
  useLayoutEffect(() => {
    if (!householdId) return
    store.setInputs({
      householdId,
      watches,
      dismissed,
      personId,
      showAdult: prefs.showAdult,
      hideUnknown: prefs.hideUnknown,
    })
  }, [store, householdId, watches, dismissed, personId, prefs.showAdult, prefs.hideUnknown])
  useEffect(() => () => store.dispose(), [store])

  const hasSources = useMemo(() => sourceMovies(ratedMovies(watches, personId)).length > 0, [watches, personId])
  const tips = list?.tips
  // Explanations name the person the list on screen was made for.
  const person = people.find((p) => p.id === list?.personId) ?? null

  const carouselItems = useMemo<CarouselItem[]>(
    () => (tips ?? []).map((tip) => ({ key: String(tip.id), title: tip.title, posterPath: tip.posterPath })),
    [tips],
  )

  function dismiss(tmdbId: number) {
    if (!household || leaving.includes(tmdbId)) return
    const householdId = household.id
    setSaveError(false)
    setLeaving((current) => [...current, tmdbId])
    // The tile fades out first; then the next tip from the buffer takes its place.
    window.setTimeout(
      () => {
        const replacement = store.dismiss(tmdbId)
        setLeaving((current) => current.filter((id) => id !== tmdbId))
        if (replacement !== null) setEntered((current) => [...current, replacement])
        void supabase
          .from('dismissed')
          .upsert({ household_id: householdId, tmdb_id: tmdbId }, { ignoreDuplicates: true })
          .then(({ error }) => {
            if (error) {
              setSaveError(true)
              store.undismiss(tmdbId)
            } else {
              void refresh()
            }
          })
      },
      view === 'carousel' ? 0 : FADE_MS,
    )
  }

  async function shuffleNow() {
    await store.shuffle()
    window.scrollTo({ top: 0 })
  }

  function showStaged() {
    store.showStaged()
    window.scrollTo({ top: 0 })
  }

  const busy = computing || shuffling

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <PageTitle>{t.suggestions.title}</PageTitle>
          <Button
            variant="secondary"
            className="shrink-0 px-4"
            disabled={busy || !tips || !hasSources}
            onClick={() => void shuffleNow()}
          >
            {busy && tips ? (
              <span
                aria-hidden
                className="size-5 animate-spin rounded-full border-2 border-muted border-t-transparent"
              />
            ) : (
              <span aria-hidden>🔀</span>
            )}
            {t.suggestions.shuffle}
          </Button>
        </div>
        <p className="mt-1 text-muted">{t.suggestions.intro}</p>
      </div>

      <ViewSwitcher value={view} onChange={setView} />

      <PersonFilter people={people} value={personId} onChange={setPersonId} label={t.suggestions.basedOn} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl bg-raised px-3 py-1">
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            className="size-5 accent-(--accent)"
            checked={prefs.showAdult}
            onChange={(e) => setPrefs({ showAdult: e.target.checked })}
          />
          {t.settings.showAdult}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            className="size-5 accent-(--accent)"
            checked={prefs.hideUnknown}
            onChange={(e) => setPrefs({ hideUnknown: e.target.checked })}
          />
          {t.suggestions.hideUnknownShort}
        </label>
      </div>

      {(error || saveError) && <ErrorNote>{t.common.genericError}</ErrorNote>}

      {!hasSources ? (
        <p className="py-8 text-center text-muted">{t.suggestions.empty}</p>
      ) : !tips ? (
        <TipsSkeleton view={view} />
      ) : (
        <>
          {staged && (
            <Button className="sticky top-3 z-10 self-center px-4 shadow-lg" onClick={showStaged}>
              <span aria-hidden>✨</span>
              {t.suggestions.newAvailable}
            </Button>
          )}
          {view === 'carousel' ? (
            <Carousel
              items={carouselItems}
              onSpinChange={onSpinChange}
              // There is no detail page for a movie that is not watched yet: show its info in the card.
              onOpen={(index) => setInfoId(tips[index].id)}
            >
              {(index) => {
                const tip = tips[index]
                const { certification, runtime } = tip
                const infoOpen = infoId === tip.id
                return (
                  <>
                    <h2 className="text-xl leading-tight font-extrabold text-balance">{tip.title}</h2>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      {releaseYear(tip.releaseDate)}
                      <span className={`rounded-full bg-raised px-2 py-0.5 text-xs font-bold ${certification ? 'text-good' : ''}`}>
                        {certification ? t.suggestions.ageLabel(certification) : t.suggestions.unknownAge}
                      </span>
                      {runtime ? <span>{t.common.minutes(runtime)}</span> : null}
                    </p>
                    <p className="text-sm font-bold text-accent">{explanation(tip, person)}</p>
                    {infoOpen && <p className="text-sm text-muted">{tip.overview || t.carousel.noInfo}</p>}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Link
                        to={`/add/${tip.id}`}
                        className="inline-flex min-h-11 items-center rounded-2xl bg-accent px-4 text-sm font-bold text-on-accent"
                      >
                        ✓ {t.carousel.watched}
                      </Link>
                      <Button variant="secondary" className="min-h-11 px-4 text-sm" onClick={() => dismiss(tip.id)}>
                        {t.carousel.dismiss}
                      </Button>
                      <Button
                        variant="secondary"
                        className="min-h-11 px-4 text-sm"
                        aria-expanded={infoOpen}
                        onClick={() => setInfoId(infoOpen ? null : tip.id)}
                      >
                        {infoOpen ? t.carousel.lessInfo : t.carousel.moreInfo}
                      </Button>
                    </div>
                  </>
                )
              }}
            </Carousel>
          ) : (
          <ol className="flex flex-col gap-3">
            {tips.map((tip) => {
              const { certification } = tip
              return (
                <li
                  key={tip.id}
                  className={`flex gap-3 rounded-3xl border border-line bg-surface p-3 transition-opacity duration-200 ${
                    leaving.includes(tip.id) ? 'opacity-0' : ''
                  } ${entered.includes(tip.id) ? 'tip-enter' : ''}`}
                >
                  <Poster path={tip.posterPath} title={tip.title} className="w-24 shrink-0 self-start" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <h2 className="text-lg leading-tight font-extrabold text-balance">{tip.title}</h2>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      {releaseYear(tip.releaseDate)}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          certification ? 'bg-raised text-good' : 'bg-raised text-muted'
                        }`}
                      >
                        {certification ? t.suggestions.ageLabel(certification) : t.suggestions.unknownAge}
                      </span>
                    </p>
                    <p className="text-sm font-bold text-accent">{explanation(tip, person)}</p>
                    {tip.overview && <p className="line-clamp-3 text-sm text-muted">{tip.overview}</p>}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Link
                        to={`/add/${tip.id}`}
                        className="inline-flex min-h-11 items-center rounded-2xl bg-accent px-4 text-sm font-bold text-on-accent"
                      >
                        ✓ {t.suggestions.watched}
                      </Link>
                      <Button variant="secondary" className="min-h-11 px-4 text-sm" onClick={() => dismiss(tip.id)}>
                        {t.suggestions.dismiss}
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          )}
          {tips.length === 0 && !computing && (
            <p className="py-8 text-center text-muted">{t.suggestions.emptyFiltered}</p>
          )}
        </>
      )}
    </div>
  )
}
