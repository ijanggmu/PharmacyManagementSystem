"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Building2, Loader2 } from "lucide-react"
import { apiGet, apiPut, getCSRFToken } from "@/lib/api/client-helpers"

interface Branch {
  id: string
  name: string
  code: string
  is_active: boolean
}

export function BranchSwitcher() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSwitching, setIsSwitching] = useState(false)

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const data = await apiGet<{ branches: Branch[]; currentBranchId: string | null }>("/api/branch-context")
        setBranches(data?.branches || [])
        setCurrentBranchId(data?.currentBranchId || data?.branches?.[0]?.id || null)
      } finally {
        setIsLoading(false)
      }
    }

    loadBranches()
  }, [])

  const handleSelect = async (branchId: string) => {
    if (branchId === currentBranchId || isSwitching) return
    setIsSwitching(true)
    try {
      const token = await getCSRFToken()
      await apiPut("/api/branch-context", { branchId }, token)
      // Full reload — every stock figure, sale, and report on the page was fetched
      // under the old branch context. A client-side state update alone left the
      // switcher looking like it did nothing, since nothing on screen re-fetched.
      window.location.reload()
    } catch {
      setIsSwitching(false)
    }
  }

  if (isLoading || branches.length === 0 || !currentBranchId) {
    return null
  }

  const current = branches.find((b) => b.id === currentBranchId) || branches[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:inline-flex gap-2" disabled={isSwitching}>
          {isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          <span className="truncate max-w-[140px]">
            {current.code || "Branch"} · {current.name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch branch</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            disabled={!branch.is_active || isSwitching}
            onClick={() => handleSelect(branch.id)}
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {branch.code} · {branch.name}
              </span>
              {!branch.is_active && (
                <span className="text-xs text-muted-foreground">Inactive</span>
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

