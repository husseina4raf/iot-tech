import { useEffect, useState } from 'react'
import { APP_BUILD_ID } from '../lib/appVersion'

const CHECK_EVERY_MS = 5 * 60 * 1000

// True once the deployed build differs from the one this tab is running. Checked on
// load, whenever the tab becomes visible again, and every few minutes. The server
// independently refuses the legacy writes an old bundle would make (see the
// guard_* migrations) — this only tells the user why and how to fix it.
export function useUpdateRequired() {
  const [required, setRequired] = useState(false)

  useEffect(() => {
    if (APP_BUILD_ID === 'dev') return undefined
    let cancelled = false

    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.buildId && data.buildId !== APP_BUILD_ID) setRequired(true)
      } catch {
        // offline, or the response was not JSON — try again at the next check
      }
    }

    check()
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(check, CHECK_EVERY_MS)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [])

  return required
}
