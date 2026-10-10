"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { DEFAULT_THEME, THEME_STORAGE_KEY as STORAGE_KEY, type Theme } from "./theme-script"

export type { Theme }

type ResolvedTheme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === "light" || stored === "dark" || stored === "system" ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
}

/** Swap the class without every element animating its colors at once. */
function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  if (root.classList.contains("dark") === (resolved === "dark")) return
  const freeze = document.createElement("style")
  freeze.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.appendChild(freeze)
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
  // Force a style flush so the frozen transitions apply before we unfreeze.
  void window.getComputedStyle(document.body).opacity
  requestAnimationFrame(() => freeze.remove())
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)
  const [systemDark, setSystemDark] = useState(false)
  // The head script already applied the stored theme; don't touch the DOM until we've read it too.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setThemeState(readStoredTheme())
    setSystemDark(systemPrefersDark())
    setHydrated(true)

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onMedia = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    // Keep every open tab on the same theme.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setThemeState(readStoredTheme())
    }
    media.addEventListener("change", onMedia)
    window.addEventListener("storage", onStorage)
    return () => {
      media.removeEventListener("change", onMedia)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const resolvedTheme: ResolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme

  useEffect(() => {
    if (hydrated) applyTheme(resolvedTheme)
  }, [hydrated, resolvedTheme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private mode / blocked storage: the choice still applies for this session.
    }
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>")
  return ctx
}
