"use client"

import type { SupplierOption } from "@/lib/api/suppliers-api"
import { useState } from "react"
import { SupplierCombobox } from "@/features/suppliers/components/supplier-combobox"
import { useSupplierOptions } from "@/features/suppliers/hooks/use-supplier-options"

interface SupplierSelectProps {
  value?: string
  /** `option` is the chosen picker row (name, phone, credit days), when known. */
  onValueChange: (supplierId: string, supplierName: string | null, option: SupplierOption | null) => void
  /** Include deactivated suppliers (e.g. to show a saved choice). Defaults to active only. */
  includeInactive?: boolean
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
  "aria-label"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "aria-required"?: boolean
}

/**
 * Self-loading supplier picker: lists suppliers from GET /suppliers/lookup, searches the server as
 * the user types, and shows loading, empty and error (with retry) states.
 */
export function SupplierSelect({ value, onValueChange, includeInactive = false, ...rest }: SupplierSelectProps) {
  const [search, setSearch] = useState("")
  const { options, knownOptions, isLoading, isSearching, error, isTruncated, refetch } = useSupplierOptions({
    search,
    includeInactive,
  })

  return (
    <SupplierCombobox
      {...rest}
      suppliers={options}
      value={value}
      selectedLabel={knownOptions.find((s) => s.id === value)?.name}
      onValueChange={(id) => {
        const option = knownOptions.find((s) => s.id === id) ?? null
        onValueChange(id, option?.name ?? null, option)
      }}
      onSearchChange={setSearch}
      isLoading={isLoading}
      isSearching={isSearching}
      error={error}
      onRetry={refetch}
      footerHint={isTruncated && !search ? "Showing the first suppliers by name. Type to search all of them." : undefined}
    />
  )
}
