"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Building2 } from "lucide-react"

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

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: userRow } = await supabase
          .from("users")
          .select("tenant_id, current_branch_id")
          .eq("id", user.id)
          .single()

        if (!userRow?.tenant_id) return

        const { data: branchesData } = await supabase
          .from("branches")
          .select("id, name, code, is_active")
          .eq("tenant_id", userRow.tenant_id)
          .order("created_at", { ascending: true })

        setBranches(branchesData || [])
        setCurrentBranchId(userRow.current_branch_id || branchesData?.[0]?.id || null)
      } finally {
        setIsLoading(false)
      }
    }

    loadBranches()
  }, [])

  const handleSelect = async (branchId: string) => {
    setCurrentBranchId(branchId)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from("users")
      .update({ current_branch_id: branchId })
      .eq("id", user.id)
  }

  if (isLoading || branches.length === 0 || !currentBranchId) {
    return null
  }

  const current = branches.find((b) => b.id === currentBranchId) || branches[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:inline-flex gap-2">
          <Building2 className="h-4 w-4" />
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
            disabled={!branch.is_active}
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

