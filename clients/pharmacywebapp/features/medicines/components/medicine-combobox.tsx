"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { HighlightMatch } from "./highlight-match"

/** Only id and name are required; the optional fields enrich the row when the caller has them. */
interface Medicine {
  id: string
  name: string
  generic_name?: string | null
  stock_quantity?: number
  strength?: string | null
  form?: string | null
  unit_price?: string | number | null
  minimum_stock?: number
}

function stockTone(m: Medicine): { label: string; variant: "success" | "warning" | "danger" } | null {
  if (m.stock_quantity === undefined) return null
  if (m.stock_quantity <= 0) return { label: "Out of stock", variant: "danger" }
  if (m.minimum_stock !== undefined && m.stock_quantity <= m.minimum_stock) return { label: `Low · ${m.stock_quantity}`, variant: "warning" }
  return { label: `${m.stock_quantity} in stock`, variant: "success" }
}

function priceText(value: Medicine["unit_price"]): string | null {
  const n = typeof value === "number" ? value : Number.parseFloat(value ?? "")
  return Number.isFinite(n) && n > 0 ? `Rs ${n.toFixed(2)}` : null
}

interface MedicineComboboxProps {
  medicines: Medicine[] | undefined
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /**
   * When provided, called (debounced) with the typed query so the parent can
   * fetch matches from the medicine database beyond whatever was preloaded
   * into `medicines` (e.g. a tenant with more medicines than the initial
   * page fetch limit). Local filtering of `medicines` still runs alongside
   * this for instant feedback while the server search is in flight.
   */
  onSearchChange?: (query: string) => void | Promise<void>
  isSearching?: boolean
  /**
   * When provided, shows a "Add new medicine" row so a medicine that
   * doesn't exist in inventory yet can be created without leaving this
   * picker. Called with the currently typed search text as a name hint.
   */
  onCreateNew?: (searchText: string) => void
  /** Lets a <Label htmlFor> target the trigger. */
  id?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

export function MedicineCombobox({
  medicines = [],
  value,
  onValueChange,
  placeholder = "Select medicine...",
  className,
  disabled = false,
  onSearchChange,
  isSearching = false,
  onCreateNew,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: MedicineComboboxProps) {
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

  const selectedMedicine = medicines.find((medicine) => medicine.id === value)

  const query = searchValue.trim().toLowerCase()
  const filteredMedicines = medicines.filter(
    (medicine) => medicine.name.toLowerCase().includes(query) || medicine.generic_name?.toLowerCase().includes(query)
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          {selectedMedicine ? (
            <span className="truncate">
              {selectedMedicine.name}
              {selectedMedicine.generic_name && (
                <span className="text-muted-foreground ml-2">({selectedMedicine.generic_name})</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,26rem)] p-0" align="start">
        {/* Items are filtered above (and by the parent's server search); cmdk's own filter would match the
            typed name against each item's value — the medicine id — and hide everything. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search medicines..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching...
              </div>
            ) : (
              <CommandEmpty>No medicine found.</CommandEmpty>
            )}
            <CommandGroup
              heading={
                !isSearching && filteredMedicines.length > 0
                  ? `${filteredMedicines.length} ${filteredMedicines.length === 1 ? "medicine" : "medicines"}`
                  : undefined
              }
            >
              {filteredMedicines.map((medicine) => {
                const tone = stockTone(medicine)
                const price = priceText(medicine.unit_price)
                const detail = [medicine.strength, medicine.form].filter(Boolean).join(" · ")
                return (
                <CommandItem
                  key={medicine.id}
                  value={medicine.id}
                  onSelect={() => {
                    onValueChange(medicine.id === value ? "" : medicine.id)
                    setOpen(false)
                    setSearchValue("")
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4 shrink-0", value === medicine.id ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        <HighlightMatch text={medicine.name} query={searchValue} />
                        {detail && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{detail}</span>}
                      </span>
                      {medicine.generic_name && (
                        <span className="truncate text-xs text-muted-foreground">
                          <HighlightMatch text={medicine.generic_name} query={searchValue} />
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {price && <span className="num text-xs font-medium tabular-nums">{price}</span>}
                      {tone && (
                        <Badge variant={tone.variant} className="num h-5 px-1.5 text-[11px] font-normal">
                          {tone.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CommandItem>
                )
              })}
            </CommandGroup>
            {onCreateNew && (
              <CommandGroup>
                <CommandItem
                  value="__create_new_medicine__"
                  onSelect={() => {
                    onCreateNew(searchValue.trim())
                    setOpen(false)
                  }}
                  className="border-t"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {searchValue.trim() ? `Add "${searchValue.trim()}" as new medicine` : "Add new medicine"}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}



