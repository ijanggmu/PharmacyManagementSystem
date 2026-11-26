"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { roleLabel } from "@/features/users/components/role-badge"
import { BASIC_ROLE } from "@/lib/api/dashboard-dotnet"

export interface RoleOption {
  id: string
  name: string
  description?: string | null
}

/**
 * Pick one or more job roles. Basic (which every user holds) isn't offered. Permissions add up: a person with
 * Pharmacist and Cashier can do everything either role allows. Names match case-insensitively so legacy
 * lowercase role names still tick.
 */
export function RoleChecklist({
  id,
  roles,
  value,
  onChange,
  isLoading = false,
  invalid = false,
  describedBy,
}: {
  id: string
  roles: readonly RoleOption[]
  value: readonly string[]
  onChange: (next: string[]) => void
  isLoading?: boolean
  invalid?: boolean
  describedBy?: string
}) {
  const options = roles.filter((r) => r.name.toLowerCase() !== BASIC_ROLE.toLowerCase())
  const chosen = new Set(value.map((v) => v.toLowerCase()))

  const toggle = (name: string) => {
    const key = name.toLowerCase()
    onChange(chosen.has(key) ? value.filter((v) => v.toLowerCase() !== key) : [...value, name])
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading roles…</p>
  }
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">No roles yet. Create one on the Roles tab first.</p>
  }

  return (
    <div
      id={id}
      role="group"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", invalid && "rounded-md ring-1 ring-destructive ring-offset-2")}
    >
      {options.map((role) => {
        const checked = chosen.has(role.name.toLowerCase())
        const inputId = `${id}-${role.id}`
        return (
          <label
            key={role.id}
            htmlFor={inputId}
            className={cn(
              "relative flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors motion-reduce:transition-none",
              "focus-within:ring-2 focus-within:ring-ring",
              checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
            )}
          >
            <input
              id={inputId}
              type="checkbox"
              // A real, focusable checkbox laid transparently over the whole option (not sr-only), so a click
              // anywhere toggles it and automation treats it as visible.
              className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-md opacity-0"
              checked={checked}
              onChange={() => toggle(role.name)}
              aria-label={roleLabel(role.name)}
              aria-describedby={role.description ? `${inputId}-desc` : undefined}
            />
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
              )}
            >
              {checked ? <Check className="size-3" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{roleLabel(role.name)}</span>
              {role.description ? (
                <span id={`${inputId}-desc`} className="block truncate text-xs text-muted-foreground" title={role.description}>
                  {role.description}
                </span>
              ) : null}
            </span>
          </label>
        )
      })}
    </div>
  )
}
