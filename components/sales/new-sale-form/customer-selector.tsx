"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Users, Check, ChevronsUpDown, UserPlus } from "lucide-react"
import { Customer } from "./types"

interface CustomerSelectorProps {
  customers: Customer[]
  selectedCustomer: Customer | null
  onCustomerSelect: (customer: Customer | null) => void
}

export function CustomerSelector({ customers, selectedCustomer, onCustomerSelect }: CustomerSelectorProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const filteredCustomers = customers.filter(customer =>
    `${customer.first_name} ${customer.last_name}`.toLowerCase().includes(searchValue.toLowerCase()) ||
    customer.phone?.includes(searchValue) ||
    customer.email?.toLowerCase().includes(searchValue.toLowerCase())
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Customer Selection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
              >
                {selectedCustomer ? (
                  `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
                ) : (
                  "Select customer..."
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput 
                  placeholder="Search customers..." 
                  value={searchValue}
                  onValueChange={setSearchValue}
                />
                <CommandList>
                  <CommandEmpty>No customer found.</CommandEmpty>
                  <CommandGroup>
                    {filteredCustomers.map((customer) => (
                      <CommandItem
                        key={customer.id}
                        value={customer.id}
                        onSelect={() => {
                          onCustomerSelect(customer)
                          setOpen(false)
                          setSearchValue("")
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            selectedCustomer?.id === customer.id ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {customer.first_name} {customer.last_name}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {customer.phone && `${customer.phone} • `}
                            {customer.email}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon">
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>

        {selectedCustomer && (
          <div className="p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">
                  {selectedCustomer.first_name} {selectedCustomer.last_name}
                </h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  {selectedCustomer.phone && (
                    <div>Phone: {selectedCustomer.phone}</div>
                  )}
                  {selectedCustomer.email && (
                    <div>Email: {selectedCustomer.email}</div>
                  )}
                </div>
              </div>
              <Badge variant="secondary">Selected</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}






