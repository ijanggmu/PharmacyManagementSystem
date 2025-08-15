"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Filter, X } from "lucide-react"
import { format } from "date-fns"

interface FilterConfig {
  field: string
  label: string
  type: "text" | "select" | "date" | "number" | "boolean"
  options?: { value: string; label: string }[]
}

interface AdvancedSearchFiltersProps {
  filters: FilterConfig[]
  onFiltersChange: (filters: Record<string, any>) => void
  onClear: () => void
}

export default function AdvancedSearchFilters({ filters, onFiltersChange, onClear }: AdvancedSearchFiltersProps) {
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({})
  const [isExpanded, setIsExpanded] = useState(false)

  const handleFilterChange = (field: string, value: any) => {
    const newFilters = { ...activeFilters }

    if (value === "" || value === null || value === undefined) {
      delete newFilters[field]
    } else {
      newFilters[field] = value
    }

    setActiveFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const clearAllFilters = () => {
    setActiveFilters({})
    onFiltersChange({})
    onClear()
  }

  const activeFilterCount = Object.keys(activeFilters).length

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Advanced Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFilterCount} active
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-8">
                <X className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setIsExpanded(!isExpanded)} className="h-8">
              {isExpanded ? "Collapse" : "Expand"}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filters.map((filter) => (
              <div key={filter.field} className="space-y-2">
                <Label htmlFor={filter.field} className="text-sm font-medium">
                  {filter.label}
                </Label>

                {filter.type === "text" && (
                  <Input
                    id={filter.field}
                    placeholder={`Search by ${filter.label.toLowerCase()}`}
                    value={activeFilters[filter.field] || ""}
                    onChange={(e) => handleFilterChange(filter.field, e.target.value)}
                    className="h-9"
                  />
                )}

                {filter.type === "select" && filter.options && (
                  <Select
                    value={activeFilters[filter.field] || filter.options[0].value} // Updated to use a non-empty string
                    onValueChange={(value) => handleFilterChange(filter.field, value)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={`Select ${filter.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {filter.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {filter.type === "date" && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 w-full justify-start text-left font-normal bg-transparent"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {activeFilters[filter.field]
                          ? format(new Date(activeFilters[filter.field]), "PPP")
                          : `Select ${filter.label.toLowerCase()}`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={activeFilters[filter.field] ? new Date(activeFilters[filter.field]) : undefined}
                        onSelect={(date) => handleFilterChange(filter.field, date?.toISOString())}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}

                {filter.type === "number" && (
                  <Input
                    id={filter.field}
                    type="number"
                    placeholder={`Enter ${filter.label.toLowerCase()}`}
                    value={activeFilters[filter.field] || ""}
                    onChange={(e) => handleFilterChange(filter.field, e.target.value)}
                    className="h-9"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Active Filters Display */}
          {activeFilterCount > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">Active filters:</span>
                {Object.entries(activeFilters).map(([field, value]) => {
                  const filter = filters.find((f) => f.field === field)
                  return (
                    <Badge key={field} variant="secondary" className="flex items-center gap-1">
                      {filter?.label}: {String(value)}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-transparent"
                        onClick={() => handleFilterChange(field, null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
</merged_code>
