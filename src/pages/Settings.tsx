import { useState, type FormEvent } from 'react'
import { CopyCode } from '../components/CopyCode'
import { PeopleEditor } from '../components/PeopleEditor'
import { Button, Card, Chip, ErrorNote, PageTitle, TextInput } from '../components/ui'
import { t } from '../i18n/strings'
import { MAX_AGE_OPTIONS } from '../lib/kijkwijzer'
import { usePrefs } from '../lib/prefs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../state/auth'
import { useHousehold } from '../state/household'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function Settings() {
  const { session } = useAuth()
  const { household, memberCount, refresh } = useHousehold()
  const [prefs, setPrefs] = usePrefs()
  const [name, setName] = useState(household?.name ?? '')
  const [code, setCode] = useState('')
  const [accountMessage, setAccountMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!household || !session) return null
  const householdId = household.id

  async function saveName(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('households').update({ name: name.trim() }).eq('id', householdId)
    if (error) setError(t.common.genericError)
    else await refresh()
    setBusy(false)
  }

  async function addAccount(e: FormEvent) {
    e.preventDefault()
    const userId = code.trim()
    if (!UUID.test(userId)) {
      setAccountMessage({ ok: false, text: t.settings.accountInvalid })
      return
    }
    setBusy(true)
    const { error } = await supabase
      .from('household_members')
      .upsert({ household_id: householdId, user_id: userId }, { ignoreDuplicates: true })
    if (error) {
      setAccountMessage({ ok: false, text: t.settings.accountInvalid })
    } else {
      setAccountMessage({ ok: true, text: t.settings.accountAdded })
      setCode('')
      await refresh()
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t.settings.title}</PageTitle>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">{t.people.title}</h2>
        <PeopleEditor />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-extrabold">{t.settings.suggestions}</h2>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold">{t.settings.maxAge}</span>
          <div className="flex flex-wrap gap-2">
            {MAX_AGE_OPTIONS.map((age) => (
              <Chip key={age} selected={prefs.maxAge === age} onClick={() => setPrefs({ maxAge: age })}>
                {age}
              </Chip>
            ))}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            className="size-6 accent-(--accent)"
            checked={prefs.hideUnknown}
            onChange={(e) => setPrefs({ hideUnknown: e.target.checked })}
          />
          <span>{t.settings.hideUnknown}</span>
        </label>
      </Card>

      <Card>
        <form onSubmit={saveName} className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold">{t.settings.household}</h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{t.settings.householdName}</span>
            <TextInput required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button
            type="submit"
            variant="secondary"
            disabled={busy || !name.trim() || name.trim() === household.name}
          >
            {t.common.save}
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">{t.settings.accounts}</h2>
        <p className="text-sm text-muted">{t.settings.linkedCount(memberCount)}</p>
        <p className="text-sm text-muted">{t.settings.accountsIntro}</p>
        <form onSubmit={addAccount} className="flex flex-col gap-3">
          <TextInput
            aria-label={t.settings.accountCode}
            placeholder={t.settings.accountCode}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setAccountMessage(null)
            }}
          />
          {accountMessage &&
            (accountMessage.ok ? (
              <p role="status" className="text-sm font-bold text-good">
                {accountMessage.text}
              </p>
            ) : (
              <ErrorNote>{accountMessage.text}</ErrorNote>
            ))}
          <Button type="submit" variant="secondary" disabled={busy || !code.trim()}>
            {t.settings.addAccount}
          </Button>
        </form>
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer content-center font-bold">{t.settings.yourCode}</summary>
          <CopyCode code={session.user.id} />
        </details>
      </Card>

      <Card className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t.settings.signedInAs(session.user.email ?? '')}</p>
        <Button variant="secondary" onClick={() => void supabase.auth.signOut()}>
          {t.settings.signOut}
        </Button>
      </Card>
    </div>
  )
}
