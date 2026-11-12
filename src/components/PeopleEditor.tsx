import { useCallback, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { t } from '../i18n/strings'
import type { Person } from '../lib/database.types'
import type { Crop } from '../lib/avatarCrop'
import { deleteAvatar, loadImage, renderAvatar, uploadAvatar } from '../lib/avatars'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../state/household'
import { AvatarCropper } from './AvatarCropper'
import { PERSON_COLORS, PERSON_EMOJIS, PersonAvatar } from './PersonAvatar'
import { Button, ErrorNote, TextInput } from './ui'

type Draft = {
  id: string | null
  name: string
  emoji: string
  color: string
  /** The stored picture; set to null by "remove". */
  avatarPath: string | null
  /** A cropped picture that is uploaded when the form is saved. */
  newAvatar: { blob: Blob; url: string } | null
}

/** List of family members with inline add / edit / delete. */
export function PeopleEditor() {
  const { household, people, refresh } = useHousehold()
  const [draft, setDraftState] = useState<Draft | null>(null)
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null)
  const pickInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Replaces the draft and frees the preview of a picture that is dropped. */
  function setDraft(next: Draft | null) {
    if (draft?.newAvatar && draft.newAvatar !== next?.newAvatar) URL.revokeObjectURL(draft.newAvatar.url)
    setDraftState(next)
  }

  const closeCropper = useCallback(() => {
    setCropImage((image) => {
      if (image) URL.revokeObjectURL(image.src)
      return null
    })
  }, [])

  if (!household) return null

  function startNew() {
    setDraft({
      id: null,
      name: '',
      emoji: PERSON_EMOJIS[people.length % PERSON_EMOJIS.length],
      color: PERSON_COLORS[people.length % PERSON_COLORS.length],
      avatarPath: null,
      newAvatar: null,
    })
  }

  function startEdit(person: Person) {
    setDraft({
      id: person.id,
      name: person.name,
      emoji: person.emoji ?? PERSON_EMOJIS[0],
      color: person.color ?? PERSON_COLORS[0],
      avatarPath: person.avatar_path,
      newAvatar: null,
    })
  }

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // so the same photo can be picked again
    if (!file) return
    setError(null)
    try {
      setCropImage(await loadImage(file))
    } catch {
      setError(t.people.avatarUnsupported)
    }
  }

  async function confirmCrop(crop: Crop) {
    if (!cropImage || !draft) return
    setBusy(true)
    try {
      const blob = await renderAvatar(cropImage, crop)
      setDraft({ ...draft, newAvatar: { blob, url: URL.createObjectURL(blob) } })
      closeCropper()
    } catch {
      closeCropper()
      setError(t.people.avatarUnsupported)
    }
    setBusy(false)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft || !household) return
    const name = draft.name.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    // New people get their id here, because the picture's path contains it.
    const id = draft.id ?? crypto.randomUUID()
    const previousPath = people.find((p) => p.id === draft.id)?.avatar_path ?? null
    let avatarPath = draft.avatarPath
    let uploadedPath: string | null = null
    try {
      if (draft.newAvatar) {
        uploadedPath = await uploadAvatar(household.id, id, draft.newAvatar.blob)
        avatarPath = uploadedPath
      }
    } catch {
      setError(t.people.avatarSaveError)
      setBusy(false)
      return
    }
    const values = { name, emoji: draft.emoji, color: draft.color, avatar_path: avatarPath }
    const { error } = draft.id
      ? await supabase.from('people').update(values).eq('id', draft.id)
      : await supabase.from('people').insert({ ...values, id, household_id: household.id })
    if (error) {
      if (uploadedPath) await deleteAvatar(uploadedPath)
      setError(t.common.genericError)
    } else {
      if (previousPath && previousPath !== avatarPath) await deleteAvatar(previousPath)
      setDraft(null)
      await refresh()
    }
    setBusy(false)
  }

  async function remove(person: Person) {
    if (!window.confirm(t.people.confirmDelete(person.name))) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('people').delete().eq('id', person.id)
    if (error) setError(t.common.genericError)
    else {
      if (person.avatar_path) await deleteAvatar(person.avatar_path)
      setDraft(null)
      await refresh()
    }
    setBusy(false)
  }

  const hasPicture = Boolean(draft?.newAvatar || draft?.avatarPath)

  return (
    <div className="flex flex-col gap-3">
      {people.length === 0 && !draft && <p className="text-muted">{t.people.empty}</p>}
      <ul className="flex flex-col gap-2">
        {people.map((person) => (
          <li key={person.id} className="flex items-center gap-3 rounded-2xl bg-raised p-2 pl-3">
            <PersonAvatar person={person} />
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
            <PersonAvatar
              person={{ ...draft, avatar_path: draft.avatarPath }}
              src={draft.newAvatar?.url}
              size="xl"
            />
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
            <legend className="mb-2 text-sm font-bold text-muted">{t.people.avatarLabel}</legend>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => pickInput.current?.click()}>
                {t.people.avatarPick}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => cameraInput.current?.click()}>
                {t.people.avatarTake}
              </Button>
              {hasPicture && (
                <Button
                  variant="danger"
                  disabled={busy}
                  aria-label={t.people.avatarRemoveLabel}
                  onClick={() => setDraft({ ...draft, avatarPath: null, newAvatar: null })}
                >
                  {t.people.avatarRemove}
                </Button>
              )}
            </div>
            {/* Without `capture` phones offer the photo library, with it the camera opens directly. */}
            <input ref={pickInput} type="file" accept="image/*" hidden onChange={pickFile} />
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={pickFile} />
          </fieldset>
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
                  if (person) void remove(person)
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
      {cropImage && draft && (
        <AvatarCropper image={cropImage} busy={busy} onCancel={closeCropper} onConfirm={confirmCrop} />
      )}
    </div>
  )
}
