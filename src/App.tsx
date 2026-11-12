import { useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Button, ErrorNote, PageTitle, Spinner } from './components/ui'
import { t } from './i18n/strings'
import { AddWatch } from './pages/AddWatch'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Search } from './pages/Search'
import { Settings } from './pages/Settings'
import { WatchDetail } from './pages/WatchDetail'
import { Watched } from './pages/Watched'
import { AuthProvider, useAuth } from './state/auth'
import { HouseholdProvider, useHousehold } from './state/household'

function Placeholder({ title }: { title: string }) {
  return <PageTitle>{title}</PageTitle>
}

function SignedIn({ userId }: { userId: string }) {
  const { loading, error, household, people, refresh } = useHousehold()
  // Decided once, after the first load, so adding the first family member
  // during onboarding does not kick the user out of the flow.
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  if (loading) return <Spinner />
  if (error) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <ErrorNote>{t.common.genericError}</ErrorNote>
        <Button onClick={() => void refresh()}>{t.common.retry}</Button>
      </main>
    )
  }
  if (needsSetup === null) {
    setNeedsSetup(!household || people.length === 0)
    return <Spinner />
  }
  if (needsSetup || !household) return <Onboarding userId={userId} onDone={() => setNeedsSetup(false)} />

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Watched />} />
          <Route path="watch/:id" element={<WatchDetail />} />
          <Route path="add" element={<Search />} />
          <Route path="add/:tmdbId" element={<AddWatch />} />
          <Route path="suggestions" element={<Placeholder title={t.suggestions.title} />} />
          <Route path="stats" element={<Placeholder title={t.stats.title} />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

function Root() {
  const { ready, session } = useAuth()
  if (!ready) return <Spinner />
  if (!session) return <Login />
  return (
    <HouseholdProvider key={session.user.id} userId={session.user.id}>
      <SignedIn userId={session.user.id} />
    </HouseholdProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  )
}
