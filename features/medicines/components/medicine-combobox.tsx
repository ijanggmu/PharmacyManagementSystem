"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "lucide-react"
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
}

export function MedicineCombobox({
  medicines = [],
  value,
  onValueChange,
  placeholder = "Select medicine...",
  className,
  disabled = false,
}: MedicineComboboxProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

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
            <CommandEmpty>No medicine found.</CommandEmpty>
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}



