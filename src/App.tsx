import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { OfflineNotice, OfflineScreen, UpdateToast } from './components/Pwa'
import { Button, ErrorNote, Spinner } from './components/ui'
import { t } from './i18n/strings'
import { isNetworkError } from './lib/network'
import { AddWatch } from './pages/AddWatch'
import { BulkAdd } from './pages/BulkAdd'
import { BackLink } from './components/MovieHeader'
import { Login } from './pages/Login'
import { MovieDetail } from './pages/MovieDetail'
import { Onboarding } from './pages/Onboarding'
import { Search } from './pages/Search'
import { Settings } from './pages/Settings'
import { Stats } from './pages/Stats'
import { Suggestions } from './pages/Suggestions'
import { WatchDetail } from './pages/WatchDetail'
import { Watched } from './pages/Watched'
import { Watchlist } from './pages/Watchlist'
import { AuthProvider, useAuth } from './state/auth'
import { HouseholdProvider, useHousehold } from './state/household'

/** The stats view as a subpage of Instellingen. */
function SettingsStats() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-4">
      <BackLink onClick={() => navigate('/settings')} />
      <Stats />
    </div>
  )
}

function SignedIn({ userId }: { userId: string }) {
  const { loading, error, household, people, refresh } = useHousehold()
  // Decided once, after the first load, so adding the first family member
  // during onboarding does not kick the user out of the flow.
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  // A start without connection ends in the error state; pick the data up by
  // itself once the connection is back.
  useEffect(() => {
    if (!error) return
    const retry = () => void refresh()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [error, refresh])

  if (loading) return <Spinner />
  if (error) {
    // The device can claim to be online without a working connection.
    if (isNetworkError(error)) return <OfflineNotice onRetry={() => void refresh()} />
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
          <Route path="add/bulk" element={<BulkAdd />} />
          <Route path="add/:tmdbId" element={<AddWatch />} />
          <Route path="suggestions" element={<Suggestions />} />
          <Route path="movie/:tmdbId" element={<MovieDetail />} />
          <Route path="watchlist" element={<Watchlist />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/stats" element={<SettingsStats />} />
          <Route path="stats" element={<Navigate to="/settings/stats" replace />} />
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
      <UpdateToast />
      <OfflineScreen />
    </AuthProvider>
  )
}
