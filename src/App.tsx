import { t } from './i18n/strings'

export default function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-6xl" aria-hidden>
        🍿
      </div>
      <h1 className="text-3xl font-extrabold">{t.appName}</h1>
      <p className="text-muted">{t.tagline}</p>
      <p className="text-sm text-muted">{t.comingSoon}</p>
    </main>
  )
}
