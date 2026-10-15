"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Home,
  ShoppingCart,
  FileText,
  Package,
  Truck,
  Users,
  RotateCcw,
  RefreshCw,
  BarChart3,
  Settings,
  Building2,
  GitBranch,
  Activity,
  Keyboard,
  Pill,
  ArrowRight,
  Sparkles,
  Landmark,
  Receipt,
  X,
} from "lucide-react"

const TOUR_STORAGE_KEY = "pharmacare_tour_completed"
const ROLE_TOUR_STORAGE_KEY_PREFIX = "pharmacare_role_tour_"
const MODULE_TOUR_STORAGE_KEY_PREFIX = "pharmacare_module_tour_"
/** Set when the user skips the welcome tour: they don't want the per-page tips either. */
const TIPS_OFF_STORAGE_KEY_PREFIX = "pharmacare_tips_off_"

function getUserKey(userId?: string | null): string {
  return userId ? userId : "anon"
}

function getTourStorageKey(userId?: string | null): string {
  return `${TOUR_STORAGE_KEY}_${getUserKey(userId)}`
}

export function getTourCompleted(userId?: string | null): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(getTourStorageKey(userId)) === "true"
}

export function setTourCompleted(userId?: string | null): void {
  if (typeof window === "undefined") return
  localStorage.setItem(getTourStorageKey(userId), "true")
}

function getTipsOff(userId?: string | null): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(TIPS_OFF_STORAGE_KEY_PREFIX + getUserKey(userId)) === "true"
}

function setTipsOff(userId?: string | null): void {
  if (typeof window === "undefined") return
  localStorage.setItem(TIPS_OFF_STORAGE_KEY_PREFIX + getUserKey(userId), "true")
}

export function resetTour(userId?: string | null): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(getTourStorageKey(userId))
  localStorage.removeItem(TIPS_OFF_STORAGE_KEY_PREFIX + getUserKey(userId))

  const userKey = getUserKey(userId)
  Object.keys(localStorage)
    .filter((key) => key.startsWith(ROLE_TOUR_STORAGE_KEY_PREFIX) && key.includes(`_${userKey}_`))
    .forEach((key) => localStorage.removeItem(key))
  Object.keys(localStorage)
    .filter((key) => key.startsWith(MODULE_TOUR_STORAGE_KEY_PREFIX) && key.includes(`_${userKey}_`))
    .forEach((key) => localStorage.removeItem(key))
}

type Role = "superadmin" | "admin" | "manager" | "pharmacist" | "cashier" | "accountant" | "staff" | "user"

type TourStep = {
  title: string
  description: string
  icon: React.ElementType
  features?: string[]
}

function getRoleStorageKey(userId: string | null | undefined, role: Role) {
  return `${ROLE_TOUR_STORAGE_KEY_PREFIX}${getUserKey(userId)}_${role}`
}

function getRoleTourCompleted(userId: string | null | undefined, role: Role): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(getRoleStorageKey(userId, role)) === "true"
}

function setRoleTourCompleted(userId: string | null | undefined, role: Role): void {
  if (typeof window === "undefined") return
  localStorage.setItem(getRoleStorageKey(userId, role), "true")
}

function getModuleStorageKey(userId: string | null | undefined, role: Role, context: string) {
  return `${MODULE_TOUR_STORAGE_KEY_PREFIX}${getUserKey(userId)}_${role}_${context}`
}

function getModuleTourCompleted(userId: string | null | undefined, role: Role, context: string): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(getModuleStorageKey(userId, role, context)) === "true"
}

function setModuleTourCompleted(userId: string | null | undefined, role: Role, context: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(getModuleStorageKey(userId, role, context), "true")
}

function getStepsForRole(role: Role): TourStep[] {
  // Global welcome & layout (all roles)
  const base: TourStep[] = [
    {
      title: "Welcome to PharmaCare",
      description:
        "This short tour will highlight the key areas of your workspace. You can restart it anytime from the user menu.",
      icon: Sparkles,
    },
    {
      title: "Dashboard overview",
      description: "Your dashboard shows today’s activity, quick shortcuts, and important alerts.",
      icon: Home,
      features: [
        "See sales, inventory, and alerts at a glance",
        "Use the left sidebar to jump between modules",
        "Notifications highlight tasks that need attention",
      ],
    },
  ]

  const keyboardStep: TourStep = {
    title: "Keyboard shortcut: Open POS",
    description: "Open the Point of Sale (New Sale) from anywhere with a single shortcut.",
    icon: Keyboard,
    features: ["Windows / Linux: Ctrl + K", "Mac: ⌘ + K"],
  }

  const endStep: TourStep = {
    title: "You're all set",
    description: "You can restart this tour anytime from the avatar menu → Restart tour.",
    icon: Pill,
  }

  switch (role) {
    case "superadmin":
      return [
        ...base,
        {
          title: "Tenant management",
          description: "Create and manage pharmacy tenants from a single place.",
          icon: Building2,
          features: [
            "Use Tenants (Administration group) to create new pharmacies",
            "Each tenant has its own code, country, currency, and timezone",
            "Tenant admins manage their own team, inventory, and sales",
          ],
        },
        {
          title: "Platform health & compliance",
          description: "Monitor system health and audit activity across all tenants.",
          icon: Activity,
          features: [
            "System Health shows uptime and integration status",
            "Audit Logs capture sensitive actions for compliance",
            "IRD / regulatory reports are available under Reports",
          ],
        },
        keyboardStep,
        endStep,
      ]
    case "admin":
      return [
        ...base,
        {
          title: "Daily operations",
          description: "Handle sales, prescriptions, and day‑to‑day counters.",
          icon: ShoppingCart,
          features: [
            "Sales: process new sales and view history",
            "Prescriptions: receive and fulfill prescriptions",
            "Returns & Refunds: correct mistakes and handle customer issues",
          ],
        },
        {
          title: "Inventory & suppliers",
          description: "Keep stock accurate and suppliers organized.",
          icon: Package,
          features: [
            "Inventory: medicines, stock levels, expiries, and categories",
            "Suppliers: manage vendors and purchase orders",
            "Low stock & expiring alerts keep you ahead of shortages",
          ],
        },
        {
          title: "People, branches & settings",
          description: "Configure users, branches, and pharmacy‑level settings.",
          icon: Settings,
          features: [
            "Users & roles: invite staff and assign access levels",
            "Branches: manage multiple locations from one account",
            "Reports & IRD: review performance and export for accounting",
          ],
        },
        keyboardStep,
        endStep,
      ]
    case "pharmacist":
      return [
        ...base,
        {
          title: "Dispensing workflow",
          description: "Move quickly between prescriptions, inventory, and the counter.",
          icon: FileText,
          features: [
            "Prescriptions: review, validate, and mark as dispensed",
            "See linked customer and medicine details before dispensing",
            "Use comments to capture clinical notes if needed",
          ],
        },
        {
          title: "Safe inventory management",
          description: "Keep an eye on stock levels and expiries.",
          icon: Package,
          features: [
            "Inventory: quickly search medicines and check availability",
            "Expiry highlights help avoid dispensing expired stock",
            "Coordinate with admin when items are low or missing",
          ],
        },
        keyboardStep,
        endStep,
      ]
    case "cashier":
      return [
        ...base,
        {
          title: "Fast checkout",
          description: "The Sales module is your primary workspace.",
          icon: ShoppingCart,
          features: [
            "Use New Sale to scan or search medicines",
            "Add or select customers directly at checkout",
            "Apply discounts and take payments from one screen",
          ],
        },
        {
          title: "Returns & refunds",
          description: "Handle after‑sale issues with clear traceability.",
          icon: RotateCcw,
          features: [
            "Returns: start from the original sale and mark items returned",
            "Refunds: issue partial or full refunds as configured by admin",
            "All actions are logged to protect both staff and customers",
          ],
        },
        keyboardStep,
        endStep,
      ]
    case "manager":
      return [
        ...base,
        {
          title: "Performance & reports",
          description: "Monitor how your pharmacy is performing.",
          icon: BarChart3,
          features: [
            "Sales reports: see trends over days, weeks, and months",
            "IRD / tax reports: export data for compliance",
            "Customer and product insights identify your best performers",
          ],
        },
        {
          title: "Operational oversight",
          description: "Stay ahead of issues before they impact patients.",
          icon: Activity,
          features: [
            "Inventory: watch low stock and expiring medicines",
            "Returns & refunds: review patterns for potential problems",
            "System health: confirm integrations are functioning",
          ],
        },
        keyboardStep,
        endStep,
      ]
    case "accountant":
      return [
        ...base,
        {
          title: "Finance",
          description: "The Finance section in the sidebar holds your day-to-day books.",
          icon: Landmark,
          features: [
            "Vouchers & ledger: post journals and drill into any account",
            "Cash & bank: deposits, cheques and bank reconciliation",
            "Receivables & payables: aging, customer receipts and supplier payments",
          ],
        },
        {
          title: "Statements & tax",
          description: "Close the period and stay compliant.",
          icon: Receipt,
          features: [
            "Statements: trial balance, profit & loss, balance sheet and cash flow",
            "Tax & IRD: VAT return, TDS and the IRD sales and purchase registers",
            "Finance setup: chart of accounts, opening balances and fiscal-year close",
          ],
        },
        keyboardStep,
        endStep,
      ]
    case "staff":
    case "user":
    default:
      return [
        ...base,
        {
          title: "Core modules",
          description: "You’ll mostly work in sales, inventory, or customers.",
          icon: Users,
          features: [
            "Sales: create and manage transactions",
            "Inventory: look up medicines and quantities",
            "Customers: find and update customer profiles",
          ],
        },
        keyboardStep,
        endStep,
      ]
  }
}

interface AppTourProps {
  /** When true, force open the tour (e.g. "Restart tour" from menu). */
  forceOpen?: boolean
  onClose?: () => void
  /** Raw role from users table (e.g. admin, pharmacist, superadmin). */
  role?: string | null
  /** Supabase auth user id. Used to track tour completion per user. */
  userId?: string | null
}

export function AppTour({ forceOpen = false, onClose, role, userId }: AppTourProps) {
  const pathname = usePathname()
  const normalizedRole: Role = useMemo(() => {
    const r = (role || "user").toLowerCase()
    if (r === "superadmin" || r === "admin" || r === "manager" || r === "pharmacist" || r === "cashier" || r === "accountant" || r === "staff") {
      return r
    }
    return "user"
  }, [role])

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  const isDashboardHome = pathname === "/dashboard"

  useEffect(() => {
    if (forceOpen) {
      setOpen(true)
      setStep(0)
      return
    }
    if (!isDashboardHome) return
    // Prevent showing tours before we know the authenticated user id.
    if (!userId) return

    const localGlobalDone = getTourCompleted(userId)
    const localRoleDone = getRoleTourCompleted(userId, normalizedRole)
    if (localGlobalDone && localRoleDone) return

    const timer = setTimeout(() => setOpen(true), 800)
    return () => clearTimeout(timer)
  }, [isDashboardHome, forceOpen, normalizedRole, userId])

  // Skipping (or closing) the welcome tour also turns off the per-page tips; finishing it keeps them.
  const handleClose = () => {
    setOpen(false)
    setStep(0)
    if (userId) {
      setTourCompleted(userId)
      setRoleTourCompleted(userId, normalizedRole)
      setTipsOff(userId)
    }
    onClose?.()
  }

  const handleComplete = () => {
    if (userId) {
      setTourCompleted(userId)
      setRoleTourCompleted(userId, normalizedRole)
    }
    setOpen(false)
    setStep(0)
    onClose?.()
  }

  const steps = useMemo(() => getStepsForRole(normalizedRole), [normalizedRole])

  const handleBack = () => {
    if (step <= 0) return
    setStep((s) => s - 1)
  }

  const handleNext = () => {
    if (step >= steps.length - 1) {
      handleComplete()
      return
    }
    setStep((s) => s + 1)
  }
  const current = steps[step]
  const Icon = current?.icon ?? Pill

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className="sm:max-w-xl"
        showCloseButton={true}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          handleClose()
          e.preventDefault()
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <DialogTitle className="text-lg">{current?.title}</DialogTitle>
              <DialogDescription className="text-sm">{current?.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {current?.features && current.features.length > 0 && (
          <ul className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            {current.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i === step ? "bg-primary" : i < step ? "bg-primary/50" : "bg-muted"
                }`}
                aria-hidden
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {step + 1} / {steps.length}
          </span>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={handleBack}>
                Back
              </Button>
            )}
            <Button type="button" onClick={handleNext}>
              {step >= steps.length - 1 ? "Finish" : "Next"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ModuleTourProps {
  role?: string | null
  /** Supabase auth user id. Used to track tour completion per user. */
  userId?: string | null
  /** Logical module key, e.g. "sales", "inventory", "returns", "tenants" */
  context: string
  /** Path prefix where this tour should auto-open, e.g. "/dashboard/sales" */
  pathPrefix: string
}

export function ModuleTour({ role, userId, context, pathPrefix }: ModuleTourProps) {
  const pathname = usePathname()
  const normalizedRole: Role = useMemo(() => {
    const r = (role || "user").toLowerCase()
    if (r === "superadmin" || r === "admin" || r === "manager" || r === "pharmacist" || r === "cashier" || r === "accountant" || r === "staff") {
      return r
    }
    return "user"
  }, [role])

  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Leaving the module hides a tip that wasn't answered; it comes back next visit.
    setOpen(false)
    const onTargetPage = pathname?.startsWith(pathPrefix)
    if (!onTargetPage) return
    // Prevent showing tours before we know the authenticated user id.
    if (!userId) return
    // Never over a screen people work fast on (a new sale, return or prescription), never stacked on the
    // welcome tour, and never once the user said no to tours.
    if (/\/(new|add)(\/|$)/.test(pathname)) return
    if (!getTourCompleted(userId) || getTipsOff(userId)) return
    if (getModuleTourCompleted(userId, normalizedRole, context)) return

    const timer = setTimeout(() => setOpen(true), 1200)
    return () => clearTimeout(timer)
  }, [pathname, pathPrefix, context, normalizedRole, userId])

  const dismiss = (allTips: boolean) => {
    setOpen(false)
    if (!userId) return
    setModuleTourCompleted(userId, normalizedRole, context)
    if (allTips) setTipsOff(userId)
  }

  const moduleSteps: TourStep[] = useMemo(() => {
    const commonEnd: TourStep = {
      title: "Tip",
      description: "You can combine search, filters, and pagination to quickly find what you need.",
      icon: Sparkles,
    }

    if (context === "sales") {
      return [
        {
          title: "Sales workspace",
          description: "Use the Sales module for day‑to‑day checkout and reviewing past transactions.",
          icon: ShoppingCart,
          features: [
            "New Sale: start a fresh transaction and add medicines",
            "Sales history: search and filter past receipts",
          ],
        },
        commonEnd,
      ]
    }

    if (context === "inventory") {
      return [
        {
          title: "Inventory overview",
          description: "Search and manage medicines, stock levels, and expiry dates.",
          icon: Package,
          features: [
            "Use search and filters to narrow down medicines",
            "Watch low‑stock and expiring badges to avoid shortages",
          ],
        },
        commonEnd,
      ]
    }

    if (context === "prescriptions") {
      return [
        {
          title: "Prescription queue",
          description: "Track, review, and fulfill prescriptions from this screen.",
          icon: FileText,
          features: [
            "Filter by status to see what needs action",
            "Open a prescription to review medicines before dispensing",
          ],
        },
        commonEnd,
      ]
    }

    if (context === "customers") {
      return [
        {
          title: "Customer records",
          description: "All customer profiles and their history live here.",
          icon: Users,
          features: [
            "Search by name or phone to find a customer",
            "Open a profile to see purchases and prescriptions",
          ],
        },
        commonEnd,
      ]
    }

    if (context === "returns") {
      return [
        {
          title: "Returns management",
          description: "Start and track medicine returns from completed sales.",
          icon: RotateCcw,
          features: [
            "Begin from an existing sale to ensure accuracy",
            "Statuses make it easy to see what’s pending vs. completed",
          ],
        },
        commonEnd,
      ]
    }

    if (context === "refunds") {
      return [
        {
          title: "Refund workflow",
          description: "Issue and track refunds with a clear audit trail.",
          icon: RefreshCw,
          features: [
            "Link refunds back to the original sale and items",
            "Use filters to review pending vs. processed refunds",
          ],
        },
        commonEnd,
      ]
    }

    if (context === "reports") {
      return [
        {
          title: "Reports hub",
          description: "View sales, inventory, and regulatory reports in one place.",
          icon: BarChart3,
          features: [
            "Sales and performance trends over time",
            "IRD and compliance exports for accounting",
          ],
        },
        commonEnd,
      ]
    }

    if (context === "tenants") {
      return [
        {
          title: "Tenant list",
          description: "As a superadmin, manage all pharmacy tenants from this table.",
          icon: Building2,
          features: [
            "Search and paginate through tenants",
            "Use Create tenant to onboard a new pharmacy and its first admin",
          ],
        },
        commonEnd,
      ]
    }

    return [
      {
        title: "Module overview",
        description: "This screen is focused on a single module of your pharmacy.",
        icon: Home,
      },
      commonEnd,
    ]
  }, [context])

  // The module's own card; the generic closing "Tip" step isn't worth a second click.
  const current = moduleSteps[0]
  const Icon = current?.icon ?? Pill

  if (!current || !open) return null

  // A small card in the corner, not a modal: the page stays usable behind it and nothing has to be
  // dismissed before the next sale. Sits above the "Report an issue" launcher.
  return (
    <section
      role="region"
      aria-labelledby={`module-tip-${context}`}
      className="fixed bottom-20 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none print:hidden"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tip</p>
          <h2 id={`module-tip-${context}`} className="text-sm font-semibold leading-snug">
            {current.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-1 -mt-1 size-8 shrink-0"
          onClick={() => dismiss(false)}
          aria-label="Dismiss tip"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      {current.features && current.features.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {current.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="text-muted-foreground">{f}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => dismiss(true)}>
          Turn off tips
        </Button>
        <Button type="button" size="sm" onClick={() => dismiss(false)}>
          Got it
        </Button>
      </div>
    </section>
  )
}
