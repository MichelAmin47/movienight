import { useState, type FormEvent } from 'react'
import { t } from '../i18n/strings'
import { todayIso } from '../lib/format'
import { useHousehold } from '../state/household'
import { PersonBadge } from './PersonBadge'
import { StarsInput } from './Stars'
import { Button, ErrorNote, TextInput } from './ui'

export type WatchFormValues = {
  watchedOn: string
  note: string
  /** person id → score; people who skipped are absent. */
  scores: Record<string, number>
}

/** Date, per-person stars and an optional note. Used for adding and editing a watch. */
export function WatchForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: WatchFormValues
  onSubmit: (values: WatchFormValues) => Promise<void>
  onCancel?: () => void
}) {
  const { people } = useHousehold()
  const [values, setValues] = useState<WatchFormValues>(
    initial ?? { watchedOn: todayIso(), note: '', scores: {} },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  function setScore(personId: string, score: number | null) {
    const scores = { ...values.scores }
    if (score === null) delete scores[personId]
    else scores[personId] = score
    setValues({ ...values, scores })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(false)
    try {
      await onSubmit(values)
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="font-bold">{t.watchForm.date}</span>
        <TextInput
          type="date"
          required
          max={todayIso()}
          value={values.watchedOn}
          onChange={(e) => setValues({ ...values, watchedOn: e.target.value })}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-bold">{t.watchForm.scores}</legend>
        {people.length === 0 ? (
          <p className="text-muted">{t.watchForm.noPeople}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{t.watchForm.scoresHint}</p>
            <ul className="flex flex-col gap-2">
              {people.map((person) => (
                <li
                  key={person.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 rounded-2xl bg-raised py-1 pr-1 pl-3"
                >
                  <span className="flex min-w-0 items-center gap-2 py-1">
                    <PersonBadge person={person} />
                    <span className="truncate font-bold">{person.name}</span>
                  </span>
                  <StarsInput
                    value={values.scores[person.id] ?? null}
                    onChange={(score) => setScore(person.id, score)}
                    label={(score) => t.watchForm.starLabel(person.name, score)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="font-bold">{t.watchForm.note}</span>
        <TextInput
          maxLength={200}
          placeholder={t.watchForm.notePlaceholder}
          value={values.note}
          onChange={(e) => setValues({ ...values, note: e.target.value })}
        />
      </label>

      {error && <ErrorNote>{t.common.genericError}</ErrorNote>}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy || !values.watchedOn}>
          {busy ? t.common.saving : t.common.save}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        )}
      </div>
    </form>
  )
}
