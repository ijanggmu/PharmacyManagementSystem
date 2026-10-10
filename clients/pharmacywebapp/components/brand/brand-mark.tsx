import { useId } from "react"
import { cn } from "@/lib/utils"

/**
 * PharmaCare mark: a capsule set at 45° on a teal tile — half solid, half translucent.
 * The same geometry ships as public/icon.svg (favicon) and app/apple-icon.tsx.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const gradientId = `pc-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" strokeOpacity="0.16" />
      <g transform="rotate(-45 16 16)">
        <rect x="7" y="11.5" width="18" height="9" rx="4.5" fill="#fff" fillOpacity="0.4" />
        <path d="M16 11.5h-4.5a4.5 4.5 0 0 0 0 9H16z" fill="#fff" />
      </g>
    </svg>
  )
}

/** Mark + wordmark. `subtitle` sits under the name (e.g. the tenant). */
export function BrandLogo({
  className,
  markClassName,
  subtitle,
}: {
  className?: string
  markClassName?: string
  subtitle?: string
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark className={cn("size-7", markClassName)} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-display text-[15px] font-semibold tracking-tight text-foreground">
          PharmaCare
        </span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  )
}
