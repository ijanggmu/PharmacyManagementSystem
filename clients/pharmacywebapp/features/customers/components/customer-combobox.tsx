"use client"

/**
 * Searchable customer picker — same pattern as medicines/medicine-combobox.tsx.
 * Used wherever a row needs to pick one customer out of a list that can run
 * into the hundreds/thousands (e.g. opening-balances migration wizard),
 * where a plain <Select> listing every row becomes unusable.
 *
 * `onSearchChange` (optional) is called debounced (300ms) with the typed
 * query so the parent can hit the server-side `search` param on the
 * customers list endpoint — the same real search used by the payables/
 * receivables tabs — instead of only ever filtering whatever was preloaded
 * into `customers`. Local filtering of `customers` still runs alongside for
 * instant feedback while the server search is in flight.
 */

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/i18n-provider"

interface ComboboxCustomer {
  id: string
  first_name: string
  last_name: string
  phone?: string | null
}

interface CustomerComboboxProps {
  customers: ComboboxCustomer[] | undefined
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  "aria-label"?: string
  /** Debounced (300ms) server-side search callback — see file header. */
  onSearchChange?: (query: string) => void | Promise<void>
  isSearching?: boolean
}

export function CustomerCombobox({
  customers = [],
  value,
  onValueChange,
  placeholder = "Select customer...",
  className,
  disabled = false,
  onSearchChange,
  isSearching = false,
  ...rest
}: CustomerComboboxProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const t = useTranslations("customers")
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

  const selected = customers.find((c) => c.id === value)
  const query = searchValue.trim().toLowerCase()
  const filtered = query
    ? customers.filter((c) => {
        const fullName = `${c.first_name} ${c.last_name}`.toLowerCase()
        return fullName.includes(query) || c.phone?.toLowerCase().includes(query)
      })
    : customers

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={rest["aria-label"]}
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          {selected ? (
            <span className="truncate">
              {selected.first_name} {selected.last_name}
              {selected.phone && <span className="ml-2 text-muted-foreground">({selected.phone})</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t("table.searchCustomers")} value={searchValue} onValueChange={setSearchValue} />
          <CommandList>
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching...
              </div>
            ) : (
              <CommandEmpty>No customer found.</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={customer.id}
                  onSelect={() => {
                    onValueChange(customer.id === value ? "" : customer.id)
                    setOpen(false)
                    setSearchValue("")
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === customer.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {customer.first_name} {customer.last_name}
                    </span>
                    {customer.phone && <span className="text-xs text-muted-foreground">{customer.phone}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
