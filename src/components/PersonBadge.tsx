import type { Person } from '../lib/database.types'

export const PERSON_EMOJIS = ['😀', '😎', '🤓', '🥳', '🦄', '🐱', '🐶', '🦊', '🐼', '🦁', '🐸', '🐵', '🦖', '🚀', '⚽', '🎸', '🌈', '👑', '🧁', '🤖']
export const PERSON_COLORS = ['#e2574c', '#f2a93b', '#3fa796', '#4c8fe2', '#8b6fd6', '#d66fa8', '#6b9b3a', '#7a8594']

/** Round avatar with the person's emoji on their color. */
export function PersonBadge({ person, size = 'md' }: { person: Pick<Person, 'emoji' | 'color' | 'name'>; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'size-7 text-base', md: 'size-10 text-xl', lg: 'size-14 text-3xl' }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${sizes[size]}`}
      style={{ backgroundColor: person.color ?? PERSON_COLORS[7] }}
    >
      {person.emoji ?? person.name.slice(0, 1).toUpperCase()}
    </span>
  )
}
