import { createContext, useContext, useState, useCallback } from 'react'

const SettingsContext = createContext(null)
const SETTINGS_KEY = 'sl_settings_v1'

const DEFAULTS = {
  leaderboardVisible: true,
}

function load() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch { return DEFAULTS }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load)

  const set = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, set }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
