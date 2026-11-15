import { t } from '../i18n/strings'
import { useOnline, usePwa } from '../lib/pwa'
import { Button } from './ui'

/** "New version available" with a button to reload into it. */
export function UpdateToast() {
  const { updateReady } = usePwa()
  if (!updateReady) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div
        role="status"
        className="flex items-center gap-2 rounded-full bg-ink py-1 pr-1 pl-5 text-sm font-bold text-canvas shadow-lg"
      >
        {t.pwa.updateAvailable}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-full bg-accent px-4 text-on-accent"
        >
          {t.pwa.reload}
        </button>
      </div>
    </div>
  )
}

/** Full-screen "no connection" message, in place of the browser's error page. */
export function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-canvas p-6 text-center"
    >
      <div className="text-6xl" aria-hidden>
        📡
      </div>
      <h1 className="text-2xl font-extrabold">{t.pwa.offlineTitle}</h1>
      <p className="text-muted">{t.pwa.offlineBody}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t.common.retry}
      </Button>
    </div>
  )
}

/**
 * Covers the app while the device reports to be offline. The app stays mounted
 * underneath, so nothing that was being filled in is lost when the connection
 * comes back.
 */
export function OfflineScreen() {
  const online = useOnline()
  if (online) return null
  return <OfflineNotice onRetry={() => window.location.reload()} />
}
