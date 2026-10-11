"use client"

import { useState } from "react"
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { useSwitchBranch } from "@/features/branches/hooks/use-switch-branch"

/** Search box appears once the list is long enough to need it. */
const SEARCH_THRESHOLD = 6

/**
 * The branch the user is working in (GET /branches/context), shown in the top bar. Users who may view
 * all branches pick another one here (POST /branches/switch); everyone else sees their branch read-only.
 * Hidden for single-branch pharmacies, where there is nothing to choose.
 */
export function BranchSwitcher() {
  const access = useBranchAccess()
  const switchBranch = useSwitchBranch()
  const [open, setOpen] = useState(false)

  const active = access.branches.filter((b) => b.isActive)
  if (access.isLoading || active.length <= 1) return null

  const current = access.ownBranch
  const label = (
    <>
      <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate font-medium">{current?.name ?? "Select branch"}</span>
      {current?.code && <span className="hidden shrink-0 font-mono text-xs text-muted-foreground lg:inline">{current.code}</span>}
    </>
  )

  if (!access.canViewAll) {
    return (
      <div
        role="status"
        title="Your role works in this branch only"
        aria-label={`Working in ${current?.name ?? "your branch"}`}
        className="hidden h-9 min-w-0 max-w-[14rem] shrink-0 items-center gap-2 rounded-lg border bg-card px-3 text-sm sm:inline-flex"
      >
        {label}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`Current branch: ${current?.name ?? "none"}. Switch branch`}
          disabled={switchBranch.isPending}
          className="h-9 min-w-0 max-w-[14rem] shrink-0 justify-start gap-2 px-3"
        >
          {switchBranch.isPending ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
          {label}
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {active.length > SEARCH_THRESHOLD && <CommandInput placeholder="Search branches…" />}
          <CommandList>
            <CommandEmpty>No branch found.</CommandEmpty>
            <CommandGroup heading="Work in branch">
              {active.map((branch) => {
                const selected = branch.id === current?.id
                return (
                  <CommandItem
                    key={branch.id}
                    value={`${branch.name} ${branch.code}`}
                    onSelect={() => {
                      setOpen(false)
                      if (!selected) switchBranch.mutate(branch.id)
                    }}
                    className="gap-2"
                  >
                    <Check className={cn("size-4", selected ? "opacity-100" : "opacity-0")} aria-hidden />
                    <span className="truncate">{branch.name}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">{branch.code}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          New sales, receipts and shifts are recorded at the branch you work in.
        </p>
      </PopoverContent>
    </Popover>
  )
}
