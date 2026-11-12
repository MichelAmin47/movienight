import { NavLink, Outlet } from 'react-router-dom'
import { t } from '../i18n/strings'

const items = [
  { to: '/', icon: '🎬', label: t.nav.watched, end: true },
  { to: '/suggestions', icon: '✨', label: t.nav.suggestions },
  { to: '/add', icon: '➕', label: t.nav.add },
  { to: '/watchlist', icon: '⭐', label: t.nav.watchlist },
  { to: '/settings', icon: '⚙️', label: t.nav.settings },
]

/** App shell: scrolling content with the TMDB footer and a fixed bottom tab bar. */
export function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <main className="flex-1 px-4 pt-6 pb-8">
        <Outlet />
      </main>
      <footer className="px-4 pb-28 text-center text-xs text-muted">
        <p className="mx-auto max-w-md">{t.footer.tmdb}</p>
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block font-bold underline"
        >
          themoviedb.org
        </a>
      </footer>
      <nav
        aria-label={t.appName}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-3xl">
          {items.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center gap-0.5 px-0.5 pt-2 pb-1 text-center text-xs leading-tight font-bold ${
                    isActive ? 'text-accent' : 'text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden
                      className={`rounded-full px-4 py-0.5 text-xl ${isActive ? 'bg-raised' : ''}`}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
