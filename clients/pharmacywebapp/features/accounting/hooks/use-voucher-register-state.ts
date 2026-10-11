"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  patchVoucherRegisterState,
  readVoucherRegisterState,
  writeVoucherRegisterState,
  type VoucherRegisterDefaults,
  type VoucherRegisterState,
} from "@/features/accounting/lib/voucher-register-params"

/**
 * Voucher register filters and paging, persisted in the URL under `prefix` (see voucher-register-params).
 * `update` merges a patch; a filter change resets to page 1.
 */
export function useVoucherRegisterState(prefix: string, defaults: VoucherRegisterDefaults) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const defaultSource = defaults.source

  const state = useMemo(
    () => readVoucherRegisterState(new URLSearchParams(searchParams.toString()), prefix, { source: defaultSource }),
    [searchParams, prefix, defaultSource]
  )

  const update = useCallback(
    (patch: Partial<VoucherRegisterState>) => {
      // Read the live query so params written elsewhere (view tab, other filters) survive.
      const live = typeof window === "undefined" ? searchParams.toString() : window.location.search
      const current = readVoucherRegisterState(new URLSearchParams(live), prefix, { source: defaultSource })
      const next = patchVoucherRegisterState(current, patch)
      const query = writeVoucherRegisterState(live, prefix, next, { source: defaultSource })
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false })
    },
    [searchParams, prefix, defaultSource, router, pathname]
  )

  return { state, update }
}
