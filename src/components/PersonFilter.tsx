import { t } from '../i18n/strings'
import type { Person } from '../lib/database.types'
import { PersonBadge } from './PersonBadge'
import { Chip } from './ui'

/**
 * "Everyone" plus one compact chip per family member. To fit a whole family
 * on a phone, each chip shows the badge and the first letter only; the full
 * name is in the tooltip and the accessible label.
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
          className="pr-2.5 pl-1"
        >
          <PersonBadge person={person} size="sm" />
          <span aria-hidden>{person.name.trim().slice(0, 1).toUpperCase()}</span>
        </Chip>
      ))}
    </div>
  )
}
