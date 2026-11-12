import { useState, type FormEvent } from 'react'
import { t } from '../i18n/strings'
import type { Person } from '../lib/database.types'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../state/household'
import { PERSON_COLORS, PERSON_EMOJIS, PersonBadge } from './PersonBadge'
import { Button, ErrorNote, TextInput } from './ui'

type Draft = { id: string | null; name: string; emoji: string; color: string }

/** List of family members with inline add / edit / delete. */
export function PeopleEditor() {
  const { household, people, refresh } = useHousehold()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!household) return null

  function startNew() {
    setDraft({
      id: null,
      name: '',
      emoji: PERSON_EMOJIS[people.length % PERSON_EMOJIS.length],
      color: PERSON_COLORS[people.length % PERSON_COLORS.length],
    })
  }

  function startEdit(person: Person) {
    setDraft({
      id: person.id,
      name: person.name,
      emoji: person.emoji ?? PERSON_EMOJIS[0],
      color: person.color ?? PERSON_COLORS[0],
    })
  }

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error } = await action()
    if (error) setError(t.common.genericError)
    else {
      setDraft(null)
      await refresh()
    }
    setBusy(false)
  }

  function save(e: FormEvent) {
    e.preventDefault()
    if (!draft || !household) return
    const values = { name: draft.name.trim(), emoji: draft.emoji, color: draft.color }
    if (!values.name) return
    void run(() =>
      draft.id
        ? supabase.from('people').update(values).eq('id', draft.id)
        : supabase.from('people').insert({ ...values, household_id: household.id }),
    )
  }

  function remove(person: Person) {
    if (!window.confirm(t.people.confirmDelete(person.name))) return
    void run(() => supabase.from('people').delete().eq('id', person.id))
  }

  return (
    <div className="flex flex-col gap-3">
      {people.length === 0 && !draft && <p className="text-muted">{t.people.empty}</p>}
      <ul className="flex flex-col gap-2">
        {people.map((person) => (
          <li key={person.id} className="flex items-center gap-3 rounded-2xl bg-raised p-2 pl-3">
            <PersonBadge person={person} />
            <span className="min-w-0 flex-1 truncate font-bold">{person.name}</span>
            <Button variant="ghost" className="px-3" onClick={() => startEdit(person)}>
              {t.common.edit}
            </Button>
          </li>
        ))}
      </ul>

      {error && <ErrorNote>{error}</ErrorNote>}

      {draft ? (
        <form onSubmit={save} className="flex flex-col gap-4 rounded-2xl border border-line p-3">
          <div className="flex items-center gap-3">
            <PersonBadge person={draft} size="lg" />
            <TextInput
              autoFocus
              required
              maxLength={30}
              aria-label={t.people.nameLabel}
              placeholder={t.people.namePlaceholder}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-muted">{t.people.emojiLabel}</legend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1">
              {PERSON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-pressed={draft.emoji === emoji}
                  onClick={() => setDraft({ ...draft, emoji })}
                  className={`flex size-11 items-center justify-center rounded-xl text-2xl ${
                    draft.emoji === emoji ? 'bg-raised ring-2 ring-accent' : 'hover:bg-raised'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-muted">{t.people.colorLabel}</legend>
            <div className="flex flex-wrap gap-2">
              {PERSON_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  aria-pressed={draft.color === color}
                  onClick={() => setDraft({ ...draft, color })}
                  className={`size-11 rounded-full ${draft.color === color ? 'ring-4 ring-ink/70 ring-offset-2 ring-offset-surface' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !draft.name.trim()}>
              {busy ? t.common.saving : t.common.save}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {t.common.cancel}
            </Button>
            {draft.id && (
              <Button
                variant="danger"
                className="ml-auto"
                disabled={busy}
                onClick={() => {
                  const person = people.find((p) => p.id === draft.id)
                  if (person) remove(person)
                }}
              >
                {t.common.delete}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={startNew}>
          + {t.people.addPerson}
        </Button>
      )}
    </div>
  )
}
