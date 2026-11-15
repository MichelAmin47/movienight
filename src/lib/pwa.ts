import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Everything around the installed app (PWA): the service worker registration,
 * the "new version" signal, the Android install prompt and the online state.
 * Kept outside React because the browser events can fire before anything is mounted.
 */

/** Chrome's install prompt event; not in the DOM typings. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type PwaState = {
  /** A newer version has taken over; this page still runs the old code. */
  updateReady: boolean
  /** The browser offers to install the app (Android/Chrome, not yet installed). */
  canInstall: boolean
}

let state: PwaState = { updateReady: false, canInstall: false }
let installEvent: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function setState(patch: Partial<PwaState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, () => state)
}

/** Shows the browser's install dialog. */
export async function promptInstall(): Promise<void> {
  const event = installEvent
  if (!event) return
  // The event can be used once, whatever the answer is.
  installEvent = null
  setState({ canInstall: false })
  await event.prompt()
}

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000

/** Call once at startup. */
export function initPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep Chrome's own banner away; Instellingen has a button for it.
    event.preventDefault()
    installEvent = event as BeforeInstallPromptEvent
    setState({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    setState({ canInstall: false })
  })

  // No service worker while developing: it would serve stale modules.
  if (!import.meta.env.PROD) return

  registerSW({
    immediate: true,
    // A new version is active. Reloading by itself could throw away a form
    // that is being filled in, so the user decides when.
    onNeedReload: () => setState({ updateReady: true }),
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // An installed app can stay open for days; look for a new version when
      // it comes back to the foreground, at most once an hour.
      let lastCheck = Date.now()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !navigator.onLine) return
        if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL) return
        lastCheck = Date.now()
        registration.update().catch(() => {})
      })
    },
  })
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

/** False while the device reports that it has no network connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine)
}
