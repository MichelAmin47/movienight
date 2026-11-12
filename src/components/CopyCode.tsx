import { useState } from 'react'
import { t } from '../i18n/strings'
import { Button } from './ui'

/** Shows the user's account code (their auth user id) with a copy button. */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the code is selectable as a fallback.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <code className="rounded-xl bg-raised px-3 py-2 text-sm break-all select-all">{code}</code>
      <Button variant="secondary" onClick={copy}>
        {copied ? t.onboarding.copied : t.onboarding.copy}
      </Button>
    </div>
  )
}
