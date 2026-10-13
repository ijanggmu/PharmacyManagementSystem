/**
 * Point-of-sale keyboard shortcuts.
 *
 * F-keys work everywhere on the POS (they never type a character), but are ignored while a dialog is open so they
 * can't act on the cart behind it. The plain keys (+, -, Delete, ?) only act when focus is NOT in a text field, so
 * typing a quantity, a discount or a search never triggers them. Escape is left to the dialogs (Radix closes them).
 * Nothing here uses Ctrl/Cmd or "/", which the global command palette and the app shell own.
 */

export type PosShortcutAction =
  | "focusSearch"
  | "focusCustomer"
  | "hold"
  | "recall"
  | "checkout"
  | "toggleUnit"
  | "increment"
  | "decrement"
  | "removeLine"
  | "help"

export interface PosShortcut {
  action: PosShortcutAction
  /** KeyboardEvent.key values that trigger it. */
  keys: string[]
  /** As printed in the help overlay. */
  label: string
  description: string
  /** F-keys fire even while typing in a field; plain keys don't. */
  whileTyping: boolean
}

export const POS_SHORTCUTS: readonly PosShortcut[] = [
  { action: "focusSearch", keys: ["F2"], label: "F2", description: "Search medicines", whileTyping: true },
  { action: "focusCustomer", keys: ["F4"], label: "F4", description: "Choose customer", whileTyping: true },
  { action: "hold", keys: ["F6"], label: "F6", description: "Hold (park) this bill", whileTyping: true },
  { action: "recall", keys: ["F7"], label: "F7", description: "Recall a held bill", whileTyping: true },
  { action: "checkout", keys: ["F8"], label: "F8", description: "Review & pay", whileTyping: true },
  { action: "toggleUnit", keys: ["F9"], label: "F9", description: "Switch the selected line between packs and units", whileTyping: true },
  { action: "increment", keys: ["+", "="], label: "+", description: "One more of the selected line", whileTyping: false },
  { action: "decrement", keys: ["-", "_"], label: "−", description: "One less of the selected line", whileTyping: false },
  { action: "removeLine", keys: ["Delete"], label: "Del", description: "Remove the selected line", whileTyping: false },
  { action: "help", keys: ["?"], label: "?", description: "Show these shortcuts", whileTyping: false },
]

/** Esc is handled by the dialogs themselves; listed in the help overlay only. */
export const ESCAPE_HINT = { label: "Esc", description: "Close the open dialog" } as const

export interface ShortcutKeyEvent {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  repeat?: boolean
}

export interface ShortcutContext {
  /** Focus is in an input, textarea, select or contenteditable element. */
  typing: boolean
  /** A modal dialog / sheet / popover is open. */
  dialogOpen: boolean
}

/** The POS action a key press maps to, or null when the POS should leave it alone. */
export function resolvePosShortcut(event: ShortcutKeyEvent, context: ShortcutContext): PosShortcutAction | null {
  // Ctrl/Cmd/Alt combinations belong to the browser, the app shell (Ctrl+K) and the command palette.
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (context.dialogOpen) return null
  const shortcut = POS_SHORTCUTS.find((s) => s.keys.includes(event.key))
  if (!shortcut) return null
  if (context.typing && !shortcut.whileTyping) return null
  // Holding an F-key down must not park / open things repeatedly; +/- may repeat.
  if (event.repeat && shortcut.whileTyping) return null
  return shortcut.action
}

/** True when `el` takes typed text (so plain-key shortcuts must not fire). */
export function isTypingElement(el: unknown): boolean {
  if (!el || typeof el !== "object") return false
  const node = el as { tagName?: unknown; isContentEditable?: unknown; type?: unknown }
  if (node.isContentEditable === true) return true
  const tag = typeof node.tagName === "string" ? node.tagName.toUpperCase() : ""
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag !== "INPUT") return false
  const type = typeof node.type === "string" ? node.type.toLowerCase() : "text"
  // Buttons, checkboxes and radios don't take text.
  return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file"].includes(type)
}
