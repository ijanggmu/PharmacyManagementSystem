"use client"

import { useQuery } from "@tanstack/react-query"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { currentUserQueryKey } from "@/features/branches/hooks/use-branch-access"
import { canAdjustCustomerLoyalty, canManageCustomerCredit, canSendDuesReminder, canViewCustomerMoney } from "@/features/customers/lib/customer-permissions"

export interface CustomerPermissions {
  /** May set or remove a customer's credit limit (the server enforces it too). */
  canManageCredit: boolean
  /** May add or remove loyalty points by hand. */
  canAdjustLoyalty: boolean
  /** May text a customer a dues reminder (the collections permission). */
  canSendReminder: boolean
  /** May see the customer's account money: ledger, statement, ageing (Customers.Ledger.View). */
  canViewMoney: boolean
  isLoading: boolean
}

/** The signed-in user's customer-account permissions, from the same cached current-user query as branch access. */
export function useCustomerPermissions(): CustomerPermissions {
  const user = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: () => loadDotnetCurrentUser(),
    staleTime: 5 * 60 * 1000,
  })
  const granted = user.data?.info.permissions ?? []
  return {
    canManageCredit: canManageCustomerCredit(granted),
    canAdjustLoyalty: canAdjustCustomerLoyalty(granted),
    canSendReminder: canSendDuesReminder(granted),
    canViewMoney: canViewCustomerMoney(granted),
    isLoading: user.isLoading,
  }
}
