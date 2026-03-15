"use client"

import { useState, useEffect } from "react"
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
} from "lucide-react"

const TOUR_STORAGE_KEY = "pharmacare_tour_completed"

export function getTourCompleted(): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(TOUR_STORAGE_KEY) === "true"
}

export function setTourCompleted(): void {
  if (typeof window === "undefined") return
  localStorage.setItem(TOUR_STORAGE_KEY, "true")
}

export function resetTour(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(TOUR_STORAGE_KEY)
}

const TOUR_STEPS: {
  title: string
  description: string
  icon: React.ElementType
  features?: string[]
}[] = [
  {
    title: "Welcome to PharmaCare",
    description: "Your pharmacy management system. This short tour will show you every module and how to get started.",
    icon: Sparkles,
  },
  {
    title: "Operations",
    description: "Core daily workflow: view the dashboard, process sales, and manage prescriptions.",
    icon: Home,
    features: ["Dashboard — overview and quick stats", "Sales — transactions and history", "Prescriptions — create and fulfill"],
  },
  {
    title: "Inventory",
    description: "Manage stock, suppliers, and purchase orders.",
    icon: Package,
    features: ["Inventory — medicines, stock levels, expiry", "Suppliers — vendors and purchase orders"],
  },
  {
    title: "Customers",
    description: "Register and manage customer records linked to sales and prescriptions.",
    icon: Users,
    features: ["Add and edit customers", "View purchase history"],
  },
  {
    title: "Returns & Refunds",
    description: "Handle medicine returns and process refunds for sales.",
    icon: RotateCcw,
    features: ["Returns — process and track", "Refunds — approve and complete"],
  },
  {
    title: "Administration",
    description: "Reports, branches, settings, and (for superadmins) tenant management.",
    icon: BarChart3,
    features: [
      "Reports — analytics and IRD",
      "System Health & Audit Logs",
      "Branches — multi-location",
      "Settings — currency, users, roles",
      "Tenants — superadmin only",
    ],
  },
  {
    title: "Keyboard shortcut: Open POS",
    description: "Open the Point of Sale (New Sale) from anywhere with a single shortcut.",
    icon: Keyboard,
    features: ["Windows/Linux: Ctrl + K", "Mac: ⌘ + K"],
  },
  {
    title: "You're all set",
    description: "You can restart this tour anytime from the user menu (avatar) → Restart tour.",
    icon: Pill,
  },
]

interface AppTourProps {
  /** When true, force open the tour (e.g. "Restart tour" from menu). */
  forceOpen?: boolean
  onClose?: () => void
}

export function AppTour({ forceOpen = false, onClose }: AppTourProps) {
  const pathname = usePathname()
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
    if (getTourCompleted()) return
    // Small delay so the dashboard is visible first
    const t = setTimeout(() => setOpen(true), 800)
    return () => clearTimeout(t)
  }, [isDashboardHome, forceOpen])

  const handleClose = () => {
    setOpen(false)
    if (!forceOpen) setTourCompleted()
    onClose?.()
  }

  const handleComplete = () => {
    setTourCompleted()
    setOpen(false)
    setStep(0)
    onClose?.()
  }

  const handleNext = () => {
    if (step >= TOUR_STEPS.length - 1) {
      handleComplete()
      return
    }
    setStep((s) => s + 1)
  }

  const handleBack = () => {
    if (step <= 0) return
    setStep((s) => s - 1)
  }

  const current = TOUR_STEPS[step]
  const Icon = current?.icon ?? Pill

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className="sm:max-w-md"
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
            {TOUR_STEPS.map((_, i) => (
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
            {step + 1} / {TOUR_STEPS.length}
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
              {step >= TOUR_STEPS.length - 1 ? "Finish" : "Next"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
