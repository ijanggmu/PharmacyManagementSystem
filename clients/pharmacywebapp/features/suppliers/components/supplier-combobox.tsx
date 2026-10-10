"use client"

/**
 * Searchable supplier picker — same pattern as medicines/medicine-combobox.tsx
 * and customers/customer-combobox.tsx. Used wherever a row needs to pick one
 * supplier out of a list that can run into the hundreds/thousands, where a
 * plain <Select> listing every row becomes unusable.
 *
 * `onSearchChange` (optional) is called debounced (300ms) with the typed
 * query so the parent can search the server instead of only filtering
 * whatever was preloaded into `suppliers`. Local filtering of `suppliers`
 * still runs alongside for instant feedback while the server search is in
 * flight. Most callers should use <SupplierSelect>, which wires this to
 * useSupplierOptions (loading, error and server search included).
 */

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AlertCircle, Check, ChevronsUpDown, Loader2, RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ComboboxSupplier {
  id: string
  name: string
  phone?: string | null
  is_active?: boolean
}

interface SupplierComboboxProps {
  suppliers: ComboboxSupplier[] | undefined
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
  "aria-label"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "aria-required"?: boolean
  /** Debounced (300ms) server-side search callback — see file header. */
  onSearchChange?: (query: string) => void | Promise<void>
  isSearching?: boolean
  /** Initial list still loading: the trigger shows a spinner and stays usable once data arrives. */
  isLoading?: boolean
  /** Load failure shown inside the list, with a retry button when `onRetry` is given. */
  error?: string | null
  onRetry?: () => void
  /** Label for the selected id when it is not in `suppliers` (e.g. outside the current search). */
  selectedLabel?: string
  /** Shown under the list, e.g. "Type to search more suppliers". */
  footerHint?: string
}

export function SupplierCombobox({
  suppliers = [],
  value,
  onValueChange,
  placeholder = "Select supplier...",
  className,
  disabled = false,
  id,
  onSearchChange,
  isSearching = false,
  isLoading = false,
  error = null,
  onRetry,
  selectedLabel,
  footerHint,
  ...rest
}: SupplierComboboxProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!onSearchChange) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSearchChange(searchValue.trim())
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue])

  const selected = suppliers.find((s) => s.id === value)
  const selectedName = selected?.name ?? (value ? selectedLabel : undefined)
  const query = searchValue.trim().toLowerCase()
  const filtered = query
    ? suppliers.filter((s) => s.name.toLowerCase().includes(query) || s.phone?.toLowerCase().includes(query))
    : suppliers

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={rest["aria-label"]}
          aria-invalid={rest["aria-invalid"]}
          aria-describedby={rest["aria-describedby"]}
          aria-required={rest["aria-required"]}
          aria-busy={isLoading || undefined}
          className={cn("w-full min-w-0 justify-between font-normal", className)}
          disabled={disabled}
        >
          {selectedName ? (
            <span className="truncate">
              {selectedName}
              {selected?.phone && <span className="ml-2 text-muted-foreground">({selected.phone})</span>}
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{isLoading ? "Loading suppliers…" : placeholder}</span>
          )}
          {isLoading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-60" aria-hidden />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0" align="start">
        {/* Items are filtered here (and by the parent's server search). cmdk's own filter would match the
            typed text against each item's value — the supplier id — and hide every supplier. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search suppliers..." value={searchValue} onValueChange={setSearchValue} />
          <CommandList>
            {error ? (
              <div role="alert" className="flex flex-col items-center gap-2 px-3 py-4 text-center text-sm">
                <span className="flex items-center gap-1.5 text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {error}
                </span>
                {onRetry && (
                  <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                    <RotateCw aria-hidden />
                    Retry
                  </Button>
                )}
              </div>
            ) : isLoading || isSearching ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {isLoading ? "Loading suppliers..." : "Searching..."}
              </div>
            ) : (
              <CommandEmpty>{query ? "No supplier matches that search." : "No suppliers yet."}</CommandEmpty>
            )}
            {!error && (
              <CommandGroup>
                {filtered.map((supplier) => (
                  <CommandItem
                    key={supplier.id}
                    value={supplier.id}
                    onSelect={() => {
                      onValueChange(supplier.id === value ? "" : supplier.id)
                      setOpen(false)
                      setSearchValue("")
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === supplier.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {supplier.name}
                        {supplier.is_active === false && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(inactive)</span>
                        )}
                      </span>
                      {supplier.phone && <span className="text-xs text-muted-foreground">{supplier.phone}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {footerHint && !error && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">{footerHint}</p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
