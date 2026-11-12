import { t } from '../i18n/strings'
import type { Person } from '../lib/database.types'
import { PersonAvatar } from './PersonAvatar'
import { Chip } from './ui'

/**
 * "Everyone" plus one compact chip per family member. To fit a whole family
 * on a phone, each chip shows only the avatar (picture, emoji or, without
 * either, the first letter); the full name is in the tooltip and the
 * accessible label.
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
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      <Chip selected={value === null} onClick={() => onChange(null)}>
        {t.common.everyone}
      </Chip>
      {people.map((person) => (
        <Chip
          key={person.id}
          selected={value === person.id}
          onClick={() => onChange(person.id)}
          title={person.name}
          ariaLabel={person.name}
          className="px-2"
        >
          <PersonAvatar person={person} size="sm" />
        </Chip>
      ))}
    </div>
  )
}
