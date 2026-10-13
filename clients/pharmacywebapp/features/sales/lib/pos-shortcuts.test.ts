import { describe, expect, it } from "vitest"
import { isTypingElement, POS_SHORTCUTS, resolvePosShortcut } from "./pos-shortcuts"

const idle = { typing: false, dialogOpen: false }
const typing = { typing: true, dialogOpen: false }

describe("POS shortcut map", () => {
  it.each([
    ["F2", "focusSearch"],
    ["F4", "focusCustomer"],
    ["F6", "hold"],
    ["F7", "recall"],
    ["F8", "checkout"],
    ["F9", "toggleUnit"],
    ["+", "increment"],
    ["=", "increment"],
    ["-", "decrement"],
    ["Delete", "removeLine"],
    ["?", "help"],
  ])("%s → %s", (key, action) => {
    expect(resolvePosShortcut({ key }, idle)).toBe(action)
  })

  it("lets F-keys work while typing in a field, but never plain keys", () => {
    expect(resolvePosShortcut({ key: "F2" }, typing)).toBe("focusSearch")
    expect(resolvePosShortcut({ key: "F8" }, typing)).toBe("checkout")
    expect(resolvePosShortcut({ key: "+" }, typing)).toBeNull()
    expect(resolvePosShortcut({ key: "-" }, typing)).toBeNull()
    expect(resolvePosShortcut({ key: "Delete" }, typing)).toBeNull()
    expect(resolvePosShortcut({ key: "?" }, typing)).toBeNull()
  })

  it("does nothing while a dialog is open (Esc and the dialog's own keys stay with it)", () => {
    for (const shortcut of POS_SHORTCUTS) {
      expect(resolvePosShortcut({ key: shortcut.keys[0] }, { typing: false, dialogOpen: true })).toBeNull()
    }
    expect(resolvePosShortcut({ key: "Escape" }, idle)).toBeNull()
  })

  it("leaves Ctrl/Cmd/Alt combinations and the command palette's / alone", () => {
    expect(resolvePosShortcut({ key: "F6", ctrlKey: true }, idle)).toBeNull()
    expect(resolvePosShortcut({ key: "-", metaKey: true }, idle)).toBeNull()
    expect(resolvePosShortcut({ key: "F4", altKey: true }, idle)).toBeNull()
    expect(resolvePosShortcut({ key: "k", ctrlKey: true }, idle)).toBeNull()
    expect(resolvePosShortcut({ key: "/" }, idle)).toBeNull()
  })

  it("ignores auto-repeat on F-keys (no double hold) but lets +/− repeat", () => {
    expect(resolvePosShortcut({ key: "F6", repeat: true }, idle)).toBeNull()
    expect(resolvePosShortcut({ key: "+", repeat: true }, idle)).toBe("increment")
  })

  it("has one entry per action and no key bound twice", () => {
    const keys = POS_SHORTCUTS.flatMap((s) => s.keys)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(POS_SHORTCUTS.map((s) => s.action)).size).toBe(POS_SHORTCUTS.length)
  })

  it("treats text inputs, textareas, selects and contenteditable as typing — not buttons or checkboxes", () => {
    expect(isTypingElement({ tagName: "INPUT", type: "text" })).toBe(true)
    expect(isTypingElement({ tagName: "INPUT", type: "number" })).toBe(true)
    expect(isTypingElement({ tagName: "INPUT", type: "search" })).toBe(true)
    expect(isTypingElement({ tagName: "TEXTAREA" })).toBe(true)
    expect(isTypingElement({ tagName: "SELECT" })).toBe(true)
    expect(isTypingElement({ tagName: "DIV", isContentEditable: true })).toBe(true)
    expect(isTypingElement({ tagName: "INPUT", type: "checkbox" })).toBe(false)
    expect(isTypingElement({ tagName: "BUTTON" })).toBe(false)
    expect(isTypingElement(null)).toBe(false)
  })
})
