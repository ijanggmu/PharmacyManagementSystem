"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Tags, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useDebounce } from "@/lib/utils/performance"
import { priceLevelsApi } from "@/features/sales/api-client-pos"
import type { PriceLevel } from "@/features/sales/lib/price-levels"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import { medicinesApi } from "@/features/medicines/api-client"
import { CustomerCombobox } from "@/features/customers/components/customer-combobox"
import { customersApi } from "@/features/customers/api-client"
import { posCustomerSearchFilters } from "@/features/sales/lib/pos-data"
import { settingsApi } from "@/features/settings/api-client"
import { useSystemSettings } from "@/features/settings/hooks/use-system-settings"

const LEVELS_KEY = ["sales", "price-levels", "all"] as const
export const PARKED_BILL_EXPIRY_KEY = "pos.parked_bill_expiry_hours"
const DEFAULT_EXPIRY_HOURS = 24

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Please try again.")

/** "10" → 10; anything outside 0–99.99 → null. */
function parsePercent(text: string): number | null {
  const n = Number(text)
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 && n < 100 ? Math.round(n * 100) / 100 : null
}

/**
 * Settings → System → Point of sale: wholesale / custom price levels (a percent below each batch price, or a special
 * price per medicine), which customers buy at them, and how long held bills are kept. The server enforces all of it.
 */
export function PriceLevelsCard() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const levels = useQuery({ queryKey: LEVELS_KEY, queryFn: () => priceLevelsApi.list(true), retry: false })
  const [newName, setNewName] = useState("")
  const [newPercent, setNewPercent] = useState("")
  const [editing, setEditing] = useState<PriceLevel | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["sales", "price-levels"] })

  const create = useMutation({
    mutationFn: (body: { name: string; discountPercent: number }) => priceLevelsApi.create(body),
    onSuccess: async () => {
      setNewName("")
      setNewPercent("")
      await refresh()
      toast({ title: "Price level added" })
    },
    onError: (error) => toast({ title: "Couldn't add the price level", description: errorText(error), variant: "destructive" }),
  })

  const percent = parsePercent(newPercent)
  const canCreate = newName.trim() !== "" && percent !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <Tags className="size-4 text-primary" aria-hidden />
          Point of sale: price levels and held bills
        </CardTitle>
        <CardDescription>
          Retail is the batch price (MRP). A level such as Wholesale sells every batch a percent below its price, or at a
          special price per medicine — never above the batch price. Customers on a level are priced at it automatically;
          selling at a cheaper level than the customer&apos;s own needs a manager&apos;s approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {levels.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load price levels: {errorText(levels.error)}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Below batch price</TableHead>
                  <TableHead className="text-right">Special prices</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Retail</TableCell>
                  <TableCell className="num text-right">0%</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right text-muted-foreground">Everyone else</TableCell>
                  <TableCell>Default</TableCell>
                  <TableCell />
                </TableRow>
                {(levels.data ?? []).map((level) => (
                  <TableRow key={level.id}>
                    <TableCell className="font-medium">{level.name}</TableCell>
                    <TableCell className="num text-right">{Number(level.discountPercent.toFixed(2))}%</TableCell>
                    <TableCell className="num text-right">{level.itemCount}</TableCell>
                    <TableCell className="num text-right">{level.customerCount}</TableCell>
                    <TableCell>{level.isActive ? "Active" : "Inactive"}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(level)} aria-label={`Edit ${level.name}`}>
                        <Pencil className="h-4 w-4" aria-hidden />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (canCreate) create.mutate({ name: newName.trim(), discountPercent: percent ?? 0 })
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-level-name">New level</Label>
            <Input id="new-level-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Wholesale" maxLength={100} className="w-48" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-level-percent">% below batch price</Label>
            <Input
              id="new-level-percent"
              type="number"
              inputMode="decimal"
              min={0}
              max={99.99}
              step={0.5}
              value={newPercent}
              onChange={(e) => setNewPercent(e.target.value)}
              placeholder="10"
              className="num w-32"
            />
          </div>
          <Button type="submit" disabled={!canCreate} loading={create.isPending}>
            <Plus className="h-4 w-4" aria-hidden />
            Add level
          </Button>
        </form>

        <AssignCustomerLevel levels={(levels.data ?? []).filter((l) => l.isActive)} onAssigned={refresh} />

        <ParkedBillExpiry />
      </CardContent>

      {editing ? <EditLevelDialog level={editing} onClose={() => setEditing(null)} onSaved={refresh} /> : null}
    </Card>
  )
}

function EditLevelDialog({ level, onClose, onSaved }: { level: PriceLevel; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { toast } = useToast()
  const [name, setName] = useState(level.name)
  const [percentText, setPercentText] = useState(String(level.discountPercent))
  const [active, setActive] = useState(level.isActive)
  const [medicineId, setMedicineId] = useState("")
  const [priceText, setPriceText] = useState("")
  const [medicineSearch, setMedicineSearch] = useState("")
  const debouncedSearch = useDebounce(medicineSearch, 300)

  const detail = useQuery({ queryKey: ["sales", "price-levels", level.id], queryFn: () => priceLevelsApi.get(level.id) })
  const medicines = useQuery({
    queryKey: ["medicines", "price-level-picker", debouncedSearch],
    queryFn: async () => {
      const result = await medicinesApi.getMedicines({ limit: 50, search: debouncedSearch || undefined, sortBy: "name", sortOrder: "asc" })
      if (result.error) throw new Error(result.error)
      return result.data ?? []
    },
    staleTime: 60_000,
  })
  const medicineName = (id: string) => medicines.data?.find((m) => m.id === id)?.name ?? `Medicine ${id.slice(0, 8)}`

  const save = useMutation({
    mutationFn: (body: { name: string; discountPercent: number; isActive: boolean }) => priceLevelsApi.update(level.id, body),
    onSuccess: async () => {
      await onSaved()
      toast({ title: "Price level saved" })
      onClose()
    },
    onError: (error) => toast({ title: "Couldn't save the price level", description: errorText(error), variant: "destructive" }),
  })
  const setPrice = useMutation({
    mutationFn: (args: { medicineId: string; unitPrice: number | null }) => priceLevelsApi.setItemPrice(level.id, args.medicineId, args.unitPrice),
    onSuccess: async () => {
      setMedicineId("")
      setPriceText("")
      await Promise.all([detail.refetch(), onSaved()])
    },
    onError: (error) => toast({ title: "Couldn't save the special price", description: errorText(error), variant: "destructive" }),
  })

  const percent = parsePercent(percentText)
  const price = Number(priceText)
  const priceValid = priceText.trim() !== "" && Number.isFinite(price) && price > 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {level.name}</DialogTitle>
          <DialogDescription>Special prices are per base unit (tablet, ml…) and VAT-inclusive, like batch prices.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-level-name">Name</Label>
            <Input id="edit-level-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-level-percent">% below batch price</Label>
            <Input id="edit-level-percent" type="number" inputMode="decimal" min={0} max={99.99} step={0.5} value={percentText} onChange={(e) => setPercentText(e.target.value)} className="num" />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch id="edit-level-active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="edit-level-active">Active (inactive levels are not applied; their customers buy at retail)</Label>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Special prices</h3>
          {detail.data && detail.data.items.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {detail.data.items.map((item) => (
                <li key={item.medicineId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="truncate">{medicineName(item.medicineId)}</span>
                  <span className="flex items-center gap-2">
                    <span className="num">Rs {item.unitPrice.toFixed(2)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPrice.mutate({ medicineId: item.medicineId, unitPrice: null })}
                      aria-label={`Remove the special price of ${medicineName(item.medicineId)}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None — every medicine is {percent ?? level.discountPercent}% below its batch price.</p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1 space-y-1.5">
              <Label htmlFor="level-item-medicine">Medicine</Label>
              <MedicineCombobox
                id="level-item-medicine"
                medicines={medicines.data}
                value={medicineId}
                onValueChange={setMedicineId}
                onSearchChange={setMedicineSearch}
                isSearching={medicines.isFetching}
                placeholder="Choose a medicine"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="level-item-price">Price per unit</Label>
              <Input id="level-item-price" type="number" inputMode="decimal" min={0.01} step={0.01} value={priceText} onChange={(e) => setPriceText(e.target.value)} className="num w-28" />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!medicineId || !priceValid}
              loading={setPrice.isPending}
              onClick={() => setPrice.mutate({ medicineId, unitPrice: Math.round(price * 100) / 100 })}
            >
              Set price
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || percent === null}
            loading={save.isPending}
            onClick={() => save.mutate({ name: name.trim(), discountPercent: percent ?? 0, isActive: active })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AssignCustomerLevel({ levels, onAssigned }: { levels: PriceLevel[]; onAssigned: () => Promise<unknown> }) {
  const { toast } = useToast()
  const [customerId, setCustomerId] = useState("")
  const [levelId, setLevelId] = useState("retail")
  const [search, setSearch] = useState("")
  const debounced = useDebounce(search, 300)
  const customers = useQuery({
    queryKey: ["customers", "price-level-picker", debounced],
    queryFn: async () => {
      const result = await customersApi.getCustomers(posCustomerSearchFilters(debounced))
      if (result.error) throw new Error(result.error)
      return result.data
    },
    staleTime: 30_000,
  })
  const current = useQuery({
    queryKey: ["sales", "price-quote", customerId, "own", ""],
    enabled: Boolean(customerId),
    queryFn: () => priceLevelsApi.quote(customerId, []),
  })
  useEffect(() => {
    if (current.data) setLevelId(current.data.customerPriceLevelId ?? "retail")
  }, [current.data])

  const assign = useMutation({
    mutationFn: (args: { customerId: string; priceLevelId: string | null }) => priceLevelsApi.assignCustomer(args.customerId, args.priceLevelId),
    onSuccess: async () => {
      await Promise.all([onAssigned(), current.refetch()])
      toast({ title: "Customer's price level saved" })
    },
    onError: (error) => toast({ title: "Couldn't assign the price level", description: errorText(error), variant: "destructive" }),
  })

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Put a customer on a price level</h3>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <CustomerCombobox
            customers={customers.data}
            value={customerId}
            onValueChange={setCustomerId}
            onSearchChange={setSearch}
            isSearching={customers.isFetching}
            aria-label="Customer"
            placeholder="Choose a customer"
          />
        </div>
        <Select value={levelId} onValueChange={setLevelId} disabled={!customerId}>
          <SelectTrigger className="w-48" aria-label="Price level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="retail">Retail</SelectItem>
            {levels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={!customerId}
          loading={assign.isPending}
          onClick={() => assign.mutate({ customerId, priceLevelId: levelId === "retail" ? null : levelId })}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

function ParkedBillExpiry() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: rows, isLoading } = useSystemSettings()
  const [hours, setHours] = useState("")
  useEffect(() => {
    if (isLoading) return
    const stored = rows?.find((r) => r.key.toLowerCase() === PARKED_BILL_EXPIRY_KEY)?.value
    setHours(stored && Number(stored) > 0 ? stored : String(DEFAULT_EXPIRY_HOURS))
  }, [isLoading, rows])

  const value = Number(hours)
  const valid = Number.isInteger(value) && value >= 1 && value <= 720
  const save = useMutation({
    mutationFn: (h: number) => settingsApi.upsert(PARKED_BILL_EXPIRY_KEY, String(h), "number"),
    onSuccess: async (result) => {
      if (result.error) {
        toast({ title: "Couldn't save", description: result.error, variant: "destructive" })
        return
      }
      await queryClient.invalidateQueries({ queryKey: ["system-settings"] })
      toast({ title: "Held-bill expiry saved" })
    },
  })

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) save.mutate(value)
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="parked-expiry-hours">Held bills expire after (hours)</Label>
        <Input
          id="parked-expiry-hours"
          type="number"
          inputMode="numeric"
          min={1}
          max={720}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          aria-invalid={!valid || undefined}
          className="num w-28"
        />
      </div>
      <Button type="submit" variant="outline" disabled={!valid} loading={save.isPending}>
        Save
      </Button>
      <p className="w-full text-xs text-muted-foreground">1 to 720 hours (30 days). Held bills never take stock or post to the ledger.</p>
    </form>
  )
}
