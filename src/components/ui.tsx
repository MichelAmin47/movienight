import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react'
import { t } from '../i18n/strings'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong',
  secondary: 'bg-raised text-ink hover:bg-line',
  ghost: 'text-ink hover:bg-raised',
  danger: 'text-danger hover:bg-raised',
}

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    />
  )
}

export function TextInput({ className = '', ...rest }: ComponentProps<'input'>) {
  return (
    <input
      className={`min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-ink placeholder:text-muted ${className}`}
      {...rest}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-line bg-surface p-4 ${className}`}>{children}</section>
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-extrabold text-balance">{children}</h1>
}

export function Spinner({ label = t.common.loading }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-muted" role="status">
      <div className="animate-bounce text-4xl" aria-hidden>
        🍿
      </div>
      <p>{label}</p>
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-raised px-4 py-3 text-sm font-semibold text-danger">
      {children}
    </p>
  )
}

/** Pill-shaped toggle used for filters and segmented choices. */
export function Chip({
  selected,
  onClick,
  children,
  title,
  ariaLabel,
  className = 'px-4',
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  title?: string
  ariaLabel?: string
  /** Horizontal padding; override for chips that start with a badge. */
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border ${className} text-sm font-bold transition-colors ${
        selected ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink hover:bg-raised'
      }`}
    >
      {children}
    </button>
  )
}
