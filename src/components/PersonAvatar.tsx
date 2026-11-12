import { useState } from 'react'
import type { Person } from '../lib/database.types'
import { useHousehold } from '../state/household'

export const PERSON_EMOJIS = ['😀', '😎', '🤓', '🥳', '🦄', '🐱', '🐶', '🦊', '🐼', '🦁', '🐸', '🐵', '🦖', '🚀', '⚽', '🎸', '🌈', '👑', '🧁', '🤖']
export const PERSON_COLORS = ['#e2574c', '#f2a93b', '#3fa796', '#4c8fe2', '#8b6fd6', '#d66fa8', '#6b9b3a', '#7a8594']

type AvatarPerson = Pick<Person, 'name' | 'emoji' | 'color'> & { avatar_path?: string | null }

const sizes = { sm: 'size-7 text-base', md: 'size-10 text-xl', chip: 'size-10 text-xl', lg: 'size-14 text-3xl', xl: 'size-20 text-4xl' }

/**
 * The one way a person is shown: their own picture if they have one, else
 * their emoji, else their first letter — always a circle in their color.
 * Decorative; put the name next to it or on the surrounding element.
 */
export function PersonAvatar({
  person,
  size = 'md',
  src,
}: {
  person: AvatarPerson
  size?: keyof typeof sizes
  /** Overrides the stored picture, e.g. a not yet saved preview. */
  src?: string | null
}) {
  const { avatarUrls } = useHousehold()
  const url = src === undefined ? (person.avatar_path ? avatarUrls[person.avatar_path] : null) : src
  // Remember the URL that failed, so a refreshed signed URL gets a new chance.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const color = person.color ?? PERSON_COLORS[7]
  const showImage = Boolean(url) && url !== failedUrl

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 ${sizes[size]}`}
      style={{ backgroundColor: color, borderColor: color }}
    >
      {showImage ? (
        <img
          src={url!}
          alt=""
          draggable={false}
          className="size-full rounded-full object-cover"
          onError={() => setFailedUrl(url!)}
        />
      ) : (
        (person.emoji ?? person.name.trim().slice(0, 1).toUpperCase())
      )}
    </span>
  )
}
