import { useState, type FormEvent } from 'react'
import { Button, Card, ErrorNote, TextInput } from '../components/ui'
import { t } from '../i18n/strings'
import { authRedirectUrl, initialAuthError, supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(initialAuthError ? t.login.linkError : null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl },
    })
    if (error) {
      setError(error.message || t.common.genericError)
      setStatus('idle')
    } else {
      setStatus('sent')
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <div className="text-6xl" aria-hidden>
          🍿
        </div>
        <h1 className="mt-2 text-3xl font-extrabold">{t.appName}</h1>
        <p className="mt-1 text-muted">{t.tagline}</p>
      </header>

      <Card>
        {status === 'sent' ? (
          <div className="flex flex-col gap-3 text-center">
            <div className="text-4xl" aria-hidden>
              📬
            </div>
            <h2 className="text-xl font-extrabold">{t.login.sentTitle}</h2>
            <p className="text-muted">{t.login.sentBody(email.trim())}</p>
            <Button variant="ghost" onClick={() => setStatus('idle')}>
              {t.login.otherEmail}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <h2 className="text-xl font-extrabold">{t.login.title}</h2>
            <p className="text-muted">{t.login.intro}</p>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">{t.login.emailLabel}</span>
              <TextInput
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder={t.login.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? t.login.sending : t.login.submit}
            </Button>
          </form>
        )}
      </Card>
    </main>
  )
}
