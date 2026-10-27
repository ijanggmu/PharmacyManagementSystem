"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useTranslations } from "@/lib/i18n/i18n-provider"

export interface PaletteLink {
  name: string
  href: string
  icon: LucideIcon
  /** Section the item belongs to, shown as muted context ("Inventory"). */
  group?: string
  shortcut?: string
  keywords?: string[]
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: PaletteLink[]
  pages: PaletteLink[]
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
}

/**
 * Global "jump to" palette. Opens with `/` (when not typing) or Ctrl/⌘+Shift+K.
 * Ctrl/⌘+K stays reserved for the POS shortcut the team already relies on.
 */
export function CommandPalette({ open, onOpenChange, actions, pages }: CommandPaletteProps) {
  const router = useRouter()
  const t = useTranslations("nav")

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)
      const combo = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k"
      if (slash || combo) {
        e.preventDefault()
        onOpenChange(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onOpenChange])

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("palette.title")}
      description={t("palette.description")}
      className="top-[20%] translate-y-0 sm:max-w-xl"
    >
      <CommandInput placeholder={t("palette.placeholder")} aria-label={t("shell.searchPages")} />
      <CommandList className="max-h-[min(60vh,420px)]">
        <CommandEmpty>{t("palette.empty")}</CommandEmpty>
        {actions.length > 0 && (
          <CommandGroup heading={t("palette.quickActions")}>
            {actions.map((item) => (
              <CommandItem
                key={`action-${item.href}`}
                value={`${item.name} ${item.keywords?.join(" ") ?? ""}`}
                onSelect={() => go(item.href)}
                className="cursor-pointer"
              >
                <item.icon className="text-primary" aria-hidden />
                <span>{item.name}</span>
                {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading={t("palette.pages")}>
          {pages.map((item) => (
            <CommandItem
              key={`page-${item.href}`}
              value={`${item.name} ${item.group ?? ""} ${item.keywords?.join(" ") ?? ""}`}
              onSelect={() => go(item.href)}
              className="cursor-pointer"
            >
              <item.icon aria-hidden />
              <span>{item.name}</span>
              {item.group && item.group !== item.name && (
                <span className="ml-auto text-xs text-muted-foreground">{item.group}</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="hidden items-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground sm:flex">
        <span><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">↑↓</kbd> {t("palette.navigate")}</span>
        <span><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">Enter</kbd> {t("palette.open")}</span>
        <span><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">Esc</kbd> {t("palette.close")}</span>
      </div>
    </CommandDialog>
  )
}
