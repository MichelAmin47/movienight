import { t } from '../i18n/strings'
import type { Person } from '../lib/database.types'
import { PersonAvatar } from './PersonAvatar'
import { Chip } from './ui'

/**
 * "Everyone" plus one avatar chip per family member, on a single row. The
 * avatar chips share the remaining width equally (capped at 64px), so they
 * are as large as the screen allows. Each chip shows only the avatar
 * (picture, emoji or, without either, the first letter); the full name is in
 * the tooltip and the accessible label.
 */
export function PersonFilter({
  people,
  value,
  onChange,
  label,
}: {
  people: Person[]
  value: string | null
  onChange: (personId: string | null) => void
  label: string
}) {
  if (people.length < 2) return null
  return (
    <div className="flex gap-1" role="group" aria-label={label}>
      <Chip selected={value === null} onClick={() => onChange(null)} className="px-3">
        {t.common.everyone}
      </Chip>
      {people.map((person) => (
        <Chip
          key={person.id}
          selected={value === person.id}
          onClick={() => onChange(person.id)}
          title={person.name}
          ariaLabel={person.name}
          className="min-w-0 max-w-16 flex-1 basis-0 justify-center p-px"
        >
          <PersonAvatar person={person} size="fill" />
        </Chip>
      ))}
    </div>
  )
}
