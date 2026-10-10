// Shared by the server root layout and the client ThemeProvider — must stay a plain module
// (no "use client"), or the server would import a client reference instead of the string.

export type Theme = "light" | "dark" | "system"

export const THEME_STORAGE_KEY = "pharmacare-theme"
/** Light is the default; dark and system are opt-in. */
export const DEFAULT_THEME: Theme = "light"

/**
 * Runs in <head> before first paint so a dark-mode user never sees a white flash.
 * A plain string (no imports) — it executes before React loads.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}")||"${DEFAULT_THEME}";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`
