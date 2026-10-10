"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { TabsContent } from "@/components/ui/tabs"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { dotnetPermissionAllowed, isDotnetRootUser } from "@/lib/api/dotnet-permissions"
import { openingBalanceAccess } from "@/features/accounting/lib/opening-balances"
import {
  buildViewHref,
  isViewPending,
  resolveActiveSection,
  type AccountingGates,
  type ActiveAccountingSection,
} from "@/features/accounting/lib/accounting-views"

interface AccountingViewValue {
  /** Page + active tab for the current URL; undefined outside the known accounting pages. */
  active: ActiveAccountingSection | undefined
  /** The URL asks for a gated tab whose permission check hasn't finished; render nothing yet. */
  pending: boolean
  /** Switches tab on the current page, keeping the other query params. */
  setView: (viewId: string) => void
  /** Extra gates (IRD, opening balances); a gate is false until the user's permissions load. */
  gates: AccountingGates
}

const AccountingViewContext = createContext<AccountingViewValue | null>(null)

export function useAccountingView(): AccountingViewValue {
  const value = useContext(AccountingViewContext)
  if (!value) throw new Error("useAccountingView must be used inside AccountingViewProvider")
  return value
}

/** IRD reports need reports:read; opening balances need accounting read (Vouchers.View) to view. */
function useAccountingGates(): AccountingGates {
  const [gates, setGates] = useState<AccountingGates>({})
  useEffect(() => {
    let cancelled = false
    loadDotnetCurrentUser()
      .then((current) => {
        if (cancelled) return
        const permissions = current?.info.permissions ?? []
        setGates({
          ird: dotnetPermissionAllowed("reports:read", permissions),
          openingBalances: openingBalanceAccess(permissions, isDotnetRootUser(permissions)).canView,
        })
      })
      .catch(() => {
        if (!cancelled) setGates({ ird: false, openingBalances: false })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return gates
}

/** Resolves the active page and `?view=` tab once for the layout chrome and the page body. */
export function AccountingViewProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const gates = useAccountingGates()
  const rawView = searchParams.get("view")

  const active = useMemo(() => resolveActiveSection(pathname, rawView, gates), [pathname, rawView, gates])
  const pending = isViewPending(active?.page, rawView, gates)

  const setView = useCallback(
    (viewId: string) => {
      if (!active || !pathname) return
      const defaultId = active.page.views[0].id
      // Read the live query so params other tabs wrote (e.g. via history.replaceState) survive.
      const search = typeof window === "undefined" ? searchParams.toString() : window.location.search
      router.replace(buildViewHref(pathname, search, viewId, defaultId), { scroll: false })
    },
    [active, pathname, router, searchParams]
  )

  const value = useMemo(() => ({ active, pending, setView, gates }), [active, pending, setView, gates])
  return <AccountingViewContext.Provider value={value}>{children}</AccountingViewContext.Provider>
}

/**
 * Body of one tab on a merged page; renders only while that tab is active. Must sit inside the
 * accounting layout, whose Tabs root it belongs to.
 */
export function AccountingTabPanel({ view, children }: { view: string; children: React.ReactNode }) {
  const { active, pending } = useAccountingView()
  if (pending || !active || active.view.id !== view) return null
  return (
    <TabsContent value={view} className="min-w-0">
      {children}
    </TabsContent>
  )
}
