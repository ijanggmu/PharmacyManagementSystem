"use client"

import { useQuery } from "@tanstack/react-query"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { currentUserQueryKey } from "@/features/branches/hooks/use-branch-access"
import type { PaymentKind } from "@/features/accounting/lib/payment-form"
import { canVoidPayments } from "@/features/accounting/lib/payment-void"

/** Whether the signed-in user may void customer receipts / supplier payments (the server enforces it too). */
export function usePaymentVoidPermission(kind: PaymentKind): boolean {
  const user = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: () => loadDotnetCurrentUser(),
    staleTime: 5 * 60 * 1000,
  })
  return canVoidPayments(kind, user.data?.info.permissions ?? [])
}
