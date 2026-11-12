import { useState, type FormEvent } from 'react'
import { CopyCode } from '../components/CopyCode'
import { PeopleEditor } from '../components/PeopleEditor'
import { Button, Card, ErrorNote, TextInput } from '../components/ui'
import { t } from '../i18n/strings'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../state/household'

/** First-run flow: create the household, then add the family members. */
export function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { household, people, refresh } = useHousehold()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('create_household', { household_name: name.trim() })
    if (error) setError(t.common.genericError)
    else await refresh()
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-6 pt-10">
      <header className="text-center">
        <div className="text-5xl" aria-hidden>
          🎬
        </div>
        <h1 className="mt-2 text-2xl font-extrabold">{t.onboarding.welcome}</h1>
      </header>

      {!household ? (
        <>
          <Card>
            <form onSubmit={create} className="flex flex-col gap-4">
              <p className="text-muted">{t.onboarding.householdIntro}</p>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">{t.onboarding.householdLabel}</span>
                <TextInput
                  required
                  maxLength={50}
                  placeholder={t.onboarding.householdPlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {error && <ErrorNote>{error}</ErrorNote>}
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? t.onboarding.creating : t.onboarding.create}
              </Button>
            </form>
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="font-extrabold">{t.onboarding.joinTitle}</h2>
            <p className="text-sm text-muted">{t.onboarding.joinBody}</p>
            <CopyCode code={userId} />
            <Button variant="ghost" onClick={() => void refresh()}>
              {t.onboarding.joinCheck}
            </Button>
          </Card>
        </>
      ) : (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-extrabold">{t.onboarding.peopleTitle}</h2>
            <p className="mt-1 text-muted">{t.onboarding.peopleIntro}</p>
          </div>
          <PeopleEditor />
          <Button disabled={people.length === 0} onClick={onDone}>
            {t.onboarding.done}
          </Button>
        </Card>
      )}
    </main>
  )
}
