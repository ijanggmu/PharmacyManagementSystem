"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Label for "select all" / clear, e.g. "All Categories" */
  allLabel?: string
  /** When true, shows an option to clear selection (select all) */
  showAllOption?: boolean
}

export function MultiSelect({
  options = [],
  value = [],
  onValueChange,
  placeholder = "Select...",
  className,
  disabled = false,
  allLabel = "All",
  showAllOption = true,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchValue.toLowerCase())
  )

  const toggle = (optValue: string) => {
    if (value.includes(optValue)) {
      onValueChange(value.filter((v) => v !== optValue))
    } else {
      onValueChange([...value, optValue])
    }
  }

  const handleSelectAll = () => {
    onValueChange([])
    setOpen(false)
    setSearchValue("")
  }

  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label)
  const displayText =
    value.length === 0
      ? placeholder
      : value.length <= 2
        ? selectedLabels.join(", ")
        : `${value.length} selected`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("min-w-[140px] justify-between font-normal", className)}
          disabled={disabled}
        >
          <span className="truncate text-muted-foreground">{displayText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup>
              {showAllOption && (
                <CommandItem onSelect={handleSelectAll}>
                  <Check className={cn("mr-2 h-4 w-4", value.length === 0 ? "opacity-100" : "opacity-0")} />
                  {allLabel}
                </CommandItem>
              )}
              {filteredOptions.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  onSelect={() => toggle(opt.value)}
                >
                  <Check className={cn("mr-2 h-4 w-4", value.includes(opt.value) ? "opacity-100" : "opacity-0")} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
