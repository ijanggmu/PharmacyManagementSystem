"use client"

import { Check, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import { passwordChecks, passwordStrength } from "@/lib/onboarding/get-started"

const BAR_TONE = ["bg-border", "bg-destructive", "bg-warning", "bg-primary", "bg-success"] as const

/** Strength meter + the real policy as a checklist (text, not color alone). */
export function PasswordStrength({ password, id }: { password: string; id: string }) {
  const { score, label } = passwordStrength(password)
  const checks = passwordChecks(password)

  return (
    <div id={id} className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={cn("h-1.5 rounded-full transition-colors duration-200", n <= score ? BAR_TONE[score] : "bg-border")}
            />
          ))}
        </div>
        <span className="w-14 text-right text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {checks.map((check) => (
          <li
            key={check.id}
            className={cn("flex items-center gap-1.5 text-xs", check.met ? "text-foreground" : "text-muted-foreground")}
          >
            {check.met ? (
              <Check className="size-3.5 text-success" aria-hidden />
            ) : (
              <Circle className="size-3 text-muted-foreground/60" aria-hidden />
            )}
            {check.label}
            <span className="sr-only">{check.met ? " — done" : " — missing"}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
