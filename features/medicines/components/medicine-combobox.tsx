"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface Medicine {
  id: string
  name: string
  generic_name?: string | null
  stock_quantity?: number
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

  const filteredMedicines = medicines.filter((medicine) =>
    medicine.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    medicine.generic_name?.toLowerCase().includes(searchValue.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
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
      <PopoverContent className="w-full p-0" align="start">
        <Command>
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
            <CommandGroup>
              {filteredMedicines.map((medicine) => (
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
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === medicine.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">{medicine.name}</span>
                    {medicine.generic_name && (
                      <span className="text-sm text-muted-foreground">{medicine.generic_name}</span>
                    )}
                    {medicine.stock_quantity !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        Stock: {medicine.stock_quantity}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
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



