/** Read-only star row, supports fractional values (e.g. an average of 3.7). */
export function StarsDisplay({ value, className = '' }: { value: number; className?: string }) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100))
  return (
    <span className={`relative inline-block leading-none whitespace-nowrap ${className}`} aria-hidden>
      <span className="text-line">★★★★★</span>
      <span className="absolute inset-y-0 left-0 overflow-hidden text-star" style={{ width: `${percent}%` }}>
        ★★★★★
      </span>
    </span>
  )
}

/** Five large tap targets; tapping the current score again clears it (skip). */
export function StarsInput({
  value,
  onChange,
  label,
  compact = false,
}: {
  value: number | null
  onChange: (value: number | null) => void
  label: (score: number) => string
  /** Slightly smaller targets (44px) for dense lists. */
  compact?: boolean
}) {
  return (
    <div className="flex" role="group">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          aria-label={label(score)}
          aria-pressed={value === score}
          onClick={() => onChange(value === score ? null : score)}
          className={`flex items-center justify-center leading-none ${compact ? 'size-11 text-3xl' : 'size-12 text-4xl'} transition-transform active:scale-125 ${
            value !== null && score <= value ? 'text-star' : 'text-line'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  )
}
