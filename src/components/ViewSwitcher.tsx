import type { ReactNode } from 'react'
import { t } from '../i18n/strings'
import type { ViewMode } from '../lib/prefs'

const icon = 'size-5 shrink-0 fill-current'

const options: { value: ViewMode; label: string; icon: ReactNode }[] = [
  {
    value: 'grid',
    label: t.view.grid,
    icon: (
      <svg viewBox="0 0 20 20" className={icon} aria-hidden>
        <rect x="2" y="2" width="7" height="7" rx="1.5" />
        <rect x="11" y="2" width="7" height="7" rx="1.5" />
        <rect x="2" y="11" width="7" height="7" rx="1.5" />
        <rect x="11" y="11" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    value: 'carousel',
    label: t.view.carousel,
    icon: (
      <svg viewBox="0 0 20 20" className={icon} aria-hidden>
        <rect x="6" y="2.5" width="8" height="15" rx="1.5" />
        <rect x="1" y="5" width="3" height="10" rx="1" opacity="0.6" />
        <rect x="16" y="5" width="3" height="10" rx="1" opacity="0.6" />
      </svg>
    ),
  },
]

/** Segmented toggle between the grid and the carousel view. */
export function ViewSwitcher({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div role="group" aria-label={t.view.label} className="flex self-start rounded-full bg-raised p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors ${
            value === option.value ? 'bg-surface text-ink shadow' : 'text-muted hover:text-ink'
          }`}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}
