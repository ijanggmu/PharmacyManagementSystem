"use client"

import { useEffect, useState } from "react"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

/** Backend AccountingPermissions.Accounts.* names. */
const ACCOUNT_PERMISSION = {
  create: "Permissions.Accounting.Accounts.Create",
  update: "Permissions.Accounting.Accounts.Update",
  activate: "Permissions.Accounting.Accounts.Activate",
  deactivate: "Permissions.Accounting.Accounts.Deactivate",
} as const

export interface AccountPermissions {
  canCreate: boolean
  /** Rename and move accounts to another head. */
  canUpdate: boolean
  canActivate: boolean
  canDeactivate: boolean
}

const NONE: AccountPermissions = { canCreate: false, canUpdate: false, canActivate: false, canDeactivate: false }

/** Chart-of-accounts write permissions for the signed-in user. Everything is false until loaded. */
export function useAccountPermissions(): AccountPermissions {
  const [permissions, setPermissions] = useState<AccountPermissions>(NONE)

  useEffect(() => {
    let cancelled = false
    loadDotnetCurrentUser()
      .then((current) => {
        if (cancelled) return
        const granted = current?.info.permissions ?? []
        const has = (name: string) => isDotnetRootUser(granted) || granted.includes(name)
        setPermissions({
          canCreate: has(ACCOUNT_PERMISSION.create),
          canUpdate: has(ACCOUNT_PERMISSION.update),
          canActivate: has(ACCOUNT_PERMISSION.activate),
          canDeactivate: has(ACCOUNT_PERMISSION.deactivate),
        })
      })
      .catch(() => !cancelled && setPermissions(NONE))
    return () => {
      cancelled = true
    }
  }, [])

  return permissions
}

/** Backend AccountingPermissions.Vouchers.Reverse — also what reversing a depreciation run requires. */
export const VOUCHER_REVERSE_PERMISSION = "Permissions.Accounting.Vouchers.Reverse"

/** Whether the signed-in user may reverse vouchers (and depreciation runs). False until loaded. */
export function useCanReverseVouchers(): boolean {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadDotnetCurrentUser()
      .then((current) => {
        if (cancelled) return
        const granted = current?.info.permissions ?? []
        setAllowed(isDotnetRootUser(granted) || granted.includes(VOUCHER_REVERSE_PERMISSION))
      })
      .catch(() => !cancelled && setAllowed(false))
    return () => {
      cancelled = true
    }
  }, [])

  return allowed
}

/** Backend AccountingPermissions.Vouchers.Post — also what POST /accounting/vat/payments requires. */
export const VOUCHER_POST_PERMISSION = "Permissions.Accounting.Vouchers.Post"

/**
 * Whether the signed-in user may post vouchers (and so record a VAT payment). False until loaded, so an action
 * the API would refuse with 403 is never offered.
 */
export function useCanPostVouchers(): boolean {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadDotnetCurrentUser()
      .then((current) => {
        if (cancelled) return
        const granted = current?.info.permissions ?? []
        setAllowed(isDotnetRootUser(granted) || granted.includes(VOUCHER_POST_PERMISSION))
      })
      .catch(() => !cancelled && setAllowed(false))
    return () => {
      cancelled = true
    }
  }, [])

  return allowed
}
