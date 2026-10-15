"use client"

import { useEffect, useRef, useState } from "react"
import { Edit, Plus, Tags, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { DetailSection } from "@/components/ui/detail-sheet"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import type { Supplier } from "@/features/suppliers/api-client"
import type { SupplierPriceListItem } from "@/features/suppliers/api-client-price-list"
import {
  useRemoveSupplierPrice,
  useSaveSupplierPrice,
  useSupplierPriceList,
  useSupplierPriceListPermissions,
} from "@/features/suppliers/hooks/use-supplier-price-list"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { packCost, perUnitCost, type SupplierPriceListInput } from "@/lib/api/suppliers-api"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { cn } from "@/lib/utils"
import { formatLocalDateYmd } from "@/lib/utils/date"

/** "Price list" block of the supplier sheet: the agreed cost per medicine, used to prefill purchase orders. */
export function SupplierPriceListSection({ supplier }: { supplier: Supplier }) {
  const t = useTranslations("suppliers")
  const { formatBsDate, formatNumber } = useI18n()
  const { toast } = useToast()
  const permissions = useSupplierPriceListPermissions()
  const list = useSupplierPriceList(supplier.id, permissions.canView)
  const remove = useRemoveSupplierPrice(supplier.id)
  const removeKeys = useRef(createIdempotencyKeyTracker())
  const [editing, setEditing] = useState<SupplierPriceListItem | "new" | null>(null)
  const [removing, setRemoving] = useState<SupplierPriceListItem | null>(null)

  if (permissions.loaded && !permissions.canView) return null
  const canAdd = permissions.canManage && supplier.is_active !== false
  const rows = list.data ?? []

  const validLabel = (row: SupplierPriceListItem) =>
    row.valid_to
      ? t("priceList.validRange", { from: formatBsDate(row.valid_from), to: formatBsDate(row.valid_to) })
      : t("priceList.validFrom", { from: formatBsDate(row.valid_from) })

  const confirmRemove = () => {
    if (!removing) return
    const itemId = removing.id
    remove.mutate(
      { itemId, idempotencyKey: removeKeys.current.keyFor(itemId) },
      {
        onSuccess: () => {
          removeKeys.current.reset()
          setRemoving(null)
          toast({ title: t("priceList.removed") })
        },
        onError: (error) =>
          toast({ title: t("priceList.removeFailed"), description: error.message, variant: "destructive" }),
      },
    )
  }

  return (
    <DetailSection
      title={t("priceList.title")}
      action={
        canAdd && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            {t("priceList.add")}
          </Button>
        )
      }
    >
      <p className="text-xs text-muted-foreground">{t("priceList.description")}</p>
      {!permissions.loaded || list.isLoading ? (
        <SkeletonTable rows={3} cols={5} />
      ) : list.error ? (
        <ErrorState size="compact" title={t("priceList.loadError")} message={list.error.message} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed">
          <EmptyState
            size="compact"
            icon={Tags}
            title={t("priceList.empty")}
            description={t("priceList.emptyDescription")}
            action={canAdd ? { label: t("priceList.add"), icon: Plus, onClick: () => setEditing("new") } : undefined}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("priceList.medicine")}</TableHead>
                <TableHead className="text-right">{t("priceList.costPerUnit")}</TableHead>
                <TableHead className="text-right">{t("priceList.costPerPack")}</TableHead>
                <TableHead className="text-right">{t("priceList.minQty")}</TableHead>
                <TableHead>{t("priceList.valid")}</TableHead>
                {permissions.canManage && (
                  <TableHead className="w-20">
                    <span className="sr-only">{t("priceList.edit")}</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const pack = packCost(row.unit_cost, row.units_per_pack)
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.medicine_name}</div>
                      {row.notes && <div className="text-xs text-muted-foreground">{row.notes}</div>}
                    </TableCell>
                    <TableCell className="num text-right font-medium">
                      <CurrencyDisplay amount={row.unit_cost} />
                    </TableCell>
                    <TableCell className="num text-right">
                      {pack != null ? (
                        <>
                          <CurrencyDisplay amount={pack} />
                          <div className="text-xs text-muted-foreground">
                            {t("priceList.packOf", { count: formatNumber(row.units_per_pack ?? 0) })}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="num text-right text-sm">
                      {row.min_order_quantity != null ? formatNumber(row.min_order_quantity) : "—"}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-sm">{validLabel(row)}</TableCell>
                    {permissions.canManage && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            aria-label={`${t("priceList.edit")} ${row.medicine_name}`}
                            title={t("priceList.edit")}
                            disabled={supplier.is_active === false}
                            onClick={() => setEditing(row)}
                          >
                            <Edit className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`${t("priceList.remove")} ${row.medicine_name}`}
                            title={t("priceList.remove")}
                            onClick={() => setRemoving(row)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <PriceListItemDialog
          supplierId={supplier.id}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        isOpen={!!removing}
        onClose={() => !remove.isPending && setRemoving(null)}
        onConfirm={confirmRemove}
        title={t("priceList.removeTitle")}
        description={t("priceList.removeDescription", { medicine: removing?.medicine_name ?? "" })}
        confirmText={t("priceList.remove")}
        cancelText={t("priceList.cancel")}
        variant="destructive"
        loading={remove.isPending}
      />
    </DetailSection>
  )
}

function parseAmount(value: string): number {
  const n = Number.parseFloat(value.replace(/,/g, ""))
  return Number.isFinite(n) ? n : Number.NaN
}

/** Add / edit one agreed price. The cost can be typed per pack; it is stored per unit. */
function PriceListItemDialog({
  supplierId,
  item,
  onClose,
}: {
  supplierId: string
  item: SupplierPriceListItem | null
  onClose: () => void
}) {
  const t = useTranslations("suppliers")
  const { toast } = useToast()
  const save = useSaveSupplierPrice(supplierId)
  const saveKeys = useRef(createIdempotencyKeyTracker())
  const [medicines, setMedicines] = useState<Medicine[]>(() =>
    item ? [{ id: item.medicine_id, name: item.medicine_name, units_per_pack: item.units_per_pack } as Medicine] : [],
  )
  const [searching, setSearching] = useState(false)
  const [medicineId, setMedicineId] = useState(item?.medicine_id ?? "")
  const [perPack, setPerPack] = useState(false)
  const [amount, setAmount] = useState(item ? String(item.unit_cost) : "")
  const [minQty, setMinQty] = useState(item?.min_order_quantity != null ? String(item.min_order_quantity) : "")
  const [validFrom, setValidFrom] = useState(item?.valid_from ?? formatLocalDateYmd(new Date()))
  const [validTo, setValidTo] = useState(item?.valid_to ?? "")
  const [notes, setNotes] = useState(item?.notes ?? "")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void medicinesApi.getMedicines({ limit: 200, sortBy: "name", sortOrder: "asc" }).then((res) => {
      if (cancelled) return
      setMedicines((prev) => [...prev, ...(res.data ?? []).filter((m) => !prev.some((p) => p.id === m.id))])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const search = async (query: string) => {
    if (!query) return
    setSearching(true)
    try {
      const res = await medicinesApi.getMedicines({ search: query, limit: 50 })
      setMedicines((prev) => [...prev, ...(res.data ?? []).filter((m) => !prev.some((p) => p.id === m.id))])
    } finally {
      setSearching(false)
    }
  }

  const medicine = medicines.find((m) => m.id === medicineId)
  const unitsPerPack = medicine?.units_per_pack ?? (item?.medicine_id === medicineId ? item.units_per_pack : null)
  const hasPack = unitsPerPack != null && unitsPerPack > 1
  const typed = parseAmount(amount)
  const unitCost = Number.isNaN(typed) ? Number.NaN : perUnitCost(typed, perPack && hasPack, unitsPerPack)

  const switchMode = (toPack: boolean) => {
    if (toPack === perPack || !hasPack) return
    // Keep the same price, re-expressed in the new unit.
    if (!Number.isNaN(typed) && typed > 0) {
      const converted = toPack ? packCost(unitCost, unitsPerPack) : perUnitCost(typed, true, unitsPerPack)
      if (converted != null) setAmount(String(converted))
    }
    setPerPack(toPack)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!medicineId) return setError(t("priceList.errorMedicine"))
    if (!(unitCost > 0)) return setError(t("priceList.errorCost"))
    const min = minQty.trim() === "" ? null : parseAmount(minQty)
    if (min !== null && !(min > 0)) return setError(t("priceList.errorMinQty"))
    if (validTo && validTo < validFrom) return setError(t("priceList.errorDates"))
    setError(null)

    const input: SupplierPriceListInput = {
      id: item?.id,
      medicine_id: medicineId,
      unit_cost: unitCost,
      min_order_quantity: min,
      valid_from: validFrom,
      valid_to: validTo || null,
      notes: notes.trim() || null,
    }
    save.mutate(
      { input, idempotencyKey: saveKeys.current.keyFor(JSON.stringify(input)) },
      {
        onSuccess: () => {
          saveKeys.current.reset()
          toast({ title: t("priceList.saved") })
          onClose()
        },
        onError: (err) => setError(err.message || t("priceList.saveFailed")),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? t("priceList.editTitle") : t("priceList.addTitle")}</DialogTitle>
          <DialogDescription>{t("priceList.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="price-list-medicine">{t("priceList.medicine")}</Label>
            <MedicineCombobox
              id="price-list-medicine"
              medicines={medicines}
              value={medicineId}
              onValueChange={(v) => {
                setMedicineId(v)
                setPerPack(false)
              }}
              placeholder={t("priceList.searchMedicine")}
              onSearchChange={search}
              isSearching={searching}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price-list-cost">{t("priceList.cost")}</Label>
            <div className="flex gap-2">
              <Input
                id="price-list-cost"
                type="text"
                inputMode="decimal"
                className="num flex-1 text-right"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-describedby="price-list-cost-help"
              />
              {hasPack && (
                <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t("priceList.cost")}>
                  {[false, true].map((pack) => (
                    <button
                      key={String(pack)}
                      type="button"
                      aria-pressed={perPack === pack}
                      onClick={() => switchMode(pack)}
                      className={cn(
                        "rounded px-2.5 text-xs font-medium transition-colors",
                        perPack === pack ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {pack ? t("priceList.perPack") : t("priceList.perUnit")}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {perPack && hasPack && unitCost > 0 && (
              <p id="price-list-cost-help" className="num text-xs text-muted-foreground">
                {t("priceList.perUnitEquals", { amount: String(unitCost) })}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="price-list-min">{t("priceList.minQty")}</Label>
            <Input
              id="price-list-min"
              type="text"
              inputMode="decimal"
              className="num text-right"
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
              aria-describedby="price-list-min-help"
            />
            <p id="price-list-min-help" className="text-xs text-muted-foreground">
              {t("priceList.minQtyHint")}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price-list-from">{t("priceList.startDate")}</Label>
              <DatePicker id="price-list-from" value={validFrom} onChange={setValidFrom} allowFuture aria-required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price-list-to">{t("priceList.endDate")}</Label>
              <DatePicker
                id="price-list-to"
                value={validTo}
                onChange={setValidTo}
                min={validFrom || undefined}
                allowFuture
                clearable
                aria-describedby="price-list-to-help"
              />
              <p id="price-list-to-help" className="text-xs text-muted-foreground">
                {t("priceList.endDateHint")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="price-list-notes">{t("priceList.notes")}</Label>
            <Input
              id="price-list-notes"
              value={notes}
              maxLength={200}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("priceList.notesPlaceholder")}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              {t("priceList.cancel")}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t("priceList.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
