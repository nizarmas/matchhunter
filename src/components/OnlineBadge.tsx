import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'

const ONLINE_MS = 2 * 60 * 1000

export function isOnline(lastSeen?: string) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_MS
}

export function OnlineBadge({ lastSeen }: { lastSeen?: string }) {
  const { t } = useApp()
  const [on, setOn] = useState(() => isOnline(lastSeen))

  useEffect(() => {
    function check() {
      setOn(isOnline(lastSeen))
    }
    check()
    const n = window.setInterval(check, 15000)
    return () => window.clearInterval(n)
  }, [lastSeen])

  if (!on) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-olive">
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-olive" />
      {t.onlineNow}
    </span>
  )
}
