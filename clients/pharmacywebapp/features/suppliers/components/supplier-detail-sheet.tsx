"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Edit,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  TrendingUp,
  Undo2,
  Upload,
  User,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DetailField, DetailFields, DetailSection, DetailSheet } from "@/components/ui/detail-sheet"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CurrencyDisplay } from "@/components/currency-display"
import { cn } from "@/lib/utils"
import CreateMedicineModal from "@/features/medicines/components/create-medicine-modal"
import BulkMedicineImportModal from "@/features/medicines/components/bulk-medicine-import-modal"
import { medicinesApi } from "@/features/medicines/api-client"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { useSupplier } from "@/features/suppliers/hooks/use-suppliers"
import { supplierReturnsApi } from "@/features/suppliers/api-client-returns"
import { DualDate } from "@/features/inventory/components/stock-transfers/transfer-parts"
import { SupplierBillsSection } from "./supplier-bills-section"

/** Rows shown before "Show all" in the medicines / cost history / returns sections. */
const PREVIEW_ROWS = 8

export function isProfileComplete(supplier: Pick<Supplier, "email" | "phone" | "contact_person">): boolean {
  return Boolean(supplier.email && supplier.phone && supplier.contact_person)
}

export function SupplierActiveBadge({ supplier }: { supplier: Pick<Supplier, "is_active"> }) {
  return supplier.is_active === false ? (
    <Badge variant="muted">
      <CircleSlash aria-hidden />
      Inactive
    </Badge>
  ) : (
    <Badge variant="success">
      <CheckCircle2 aria-hidden />
      Active
    </Badge>
  )
}

function ShowAllToggle({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
  if (total <= PREVIEW_ROWS) return null
  return (
    <Button variant="ghost" size="sm" className="w-full" onClick={onToggle}>
      {expanded ? "Show fewer" : `Show all ${total}`}
    </Button>
  )
}

/** Right-side details for one supplier. */
export function SupplierDetailSheet({
  supplier,
  onOpenChange,
  onEdit,
  onOpenLedger,
}: {
  supplier: Supplier | null
  onOpenChange: (open: boolean) => void
  onEdit: (supplier: Supplier) => void
  onOpenLedger: (supplier: Supplier) => void
}) {
  const queryClient = useQueryClient()
  const supplierId = supplier?.id ?? ""
  const open = !!supplier
  const [isCreateMedicineOpen, setIsCreateMedicineOpen] = useState(false)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
  const [expanded, setExpanded] = useState<{ medicines: boolean; costs: boolean; returns: boolean }>({
    medicines: false,
    costs: false,
    returns: false,
  })

  // Fresh balance and PAN when the sheet opens (the list row may be minutes old). Shares the
  // supplierKeys.detail cache entry, so it must go through useSupplier to keep one cached shape.
  const detail = useSupplier(open ? supplierId : "")
  const medicines = useQuery({
    queryKey: ["suppliers", "detail", supplierId, "medicines"],
    queryFn: async () => {
      // Filtered server-side so medicines beyond the first page are included.
      const res = await medicinesApi.getMedicines({ supplierId, limit: 1000, sortBy: "name", sortOrder: "asc" })
      if (res.error) throw new Error(res.error)
      return res.data ?? []
    },
    enabled: open,
  })
  const costs = useQuery({
    queryKey: ["suppliers", "detail", supplierId, "cost-history"],
    queryFn: async () => {
      const res = await suppliersApi.getCostHistory(supplierId)
      if (res.error) throw new Error(res.error)
      return res.data ?? []
    },
    enabled: open,
  })
  const returns = useQuery({
    queryKey: ["suppliers", "detail", supplierId, "returns"],
    queryFn: async () => {
      const res = await supplierReturnsApi.list(supplierId, { limit: 50 })
      if (res.error) throw new Error(res.error)
      return res.data ?? []
    },
    enabled: open,
  })

  const current = detail.data ?? supplier
  const payable = Number(current?.payable_amount ?? 0)
  const receivable = Number(current?.receivable_amount ?? 0)
  const medicineRows = medicines.data ?? []
  const lowStock = medicineRows.filter((m) => m.stock_quantity > 0 && m.stock_quantity <= m.minimum_stock).length
  const outOfStock = medicineRows.filter((m) => m.stock_quantity === 0).length

  // Return items carry only a medicine id; resolve names from this supplier's medicines.
  const medicineNameById = new Map(medicineRows.map((m) => [m.id, m.name]))
  const returnRows = (returns.data ?? []).flatMap((ret) =>
    ret.items.map((item) => ({
      key: `${ret.id}-${item.id}`,
      date: ret.returnDateUtc,
      medicineName: medicineNameById.get(item.medicineId) ?? "Medicine no longer linked",
      quantity: item.quantity,
      reason: item.returnReason,
      totalCost: item.totalCost,
    })),
  )

  const refreshMedicines = () =>
    void queryClient.invalidateQueries({ queryKey: ["suppliers", "detail", supplierId, "medicines"] })

  return (
    <>
      <DetailSheet
        open={open}
        onOpenChange={onOpenChange}
        size="xl"
        title={current?.name ?? "Supplier"}
        badges={
          current && (
            <>
              <SupplierActiveBadge supplier={current} />
              {!isProfileComplete(current) && (
                <Badge variant="warning" title="Missing email, phone or contact person">
                  <AlertCircle aria-hidden />
                  Incomplete profile
                </Badge>
              )}
            </>
          )
        }
        description={
          current && (
            <span className="num">
              {current.tax_id ? `PAN / VAT ${current.tax_id}` : "No PAN / VAT number on file"} · Added{" "}
              {new Date(current.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )
        }
        headerActions={
          current && (
            <>
              <Button size="sm" variant="outline" onClick={() => onEdit(current)}>
                <Edit aria-hidden />
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsCreateMedicineOpen(true)}>
                <Plus aria-hidden />
                Add medicine
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsBulkImportOpen(true)}>
                <Upload aria-hidden />
                Bulk import
              </Button>
            </>
          )
        }
        error={detail.error}
        onRetry={() => void detail.refetch()}
        retrying={detail.isFetching}
      >
        {current && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className={cn("rounded-lg border p-3", payable > 0 && "border-warning/30 bg-warning/5")}>
                <p className="text-xs text-muted-foreground">You owe (payable)</p>
                <p className={cn("num mt-1 text-lg font-semibold", payable > 0 ? "text-warning" : "text-foreground")}>
                  <CurrencyDisplay amount={payable} />
                </p>
              </div>
              <div className={cn("rounded-lg border p-3", receivable > 0 && "border-success/30 bg-success/5")}>
                <p className="text-xs text-muted-foreground">They owe (advance)</p>
                <p className={cn("num mt-1 text-lg font-semibold", receivable > 0 ? "text-success" : "text-foreground")}>
                  <CurrencyDisplay amount={receivable} />
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Medicines</p>
                <p className="num mt-1 text-lg font-semibold">{medicines.isLoading ? "…" : medicineRows.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Low / out of stock</p>
                <p className={cn("num mt-1 text-lg font-semibold", lowStock + outOfStock > 0 && "text-warning")}>
                  {medicines.isLoading ? "…" : `${lowStock} / ${outOfStock}`}
                </p>
              </div>
            </div>

            <DetailSection title="Contact">
              <DetailFields>
                <DetailField label="Contact person">
                  {current.contact_person && (
                    <span className="inline-flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {current.contact_person}
                    </span>
                  )}
                </DetailField>
                <DetailField label="Phone" mono>
                  {current.phone && (
                    <a href={`tel:${current.phone}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {current.phone}
                    </a>
                  )}
                </DetailField>
                <DetailField label="Email">
                  {current.email && (
                    <a href={`mailto:${current.email}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {current.email}
                    </a>
                  )}
                </DetailField>
                <DetailField label="PAN / VAT no." mono>
                  {current.tax_id}
                </DetailField>
                <DetailField label="Address" className="sm:col-span-2">
                  {current.address && (
                    <span className="inline-flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {current.address}
                    </span>
                  )}
                </DetailField>
                <DetailField label="Added">
                  <DualDate utc={current.created_at} withTime={false} />
                </DetailField>
                <DetailField label="Last updated">{current.updated_at && <DualDate utc={current.updated_at} />}</DetailField>
              </DetailFields>
            </DetailSection>

            {/* Track D: bill-wise view with GRN numbers and "Pay this bill" goes here. */}
            <SupplierBillsSection supplier={current} onOpenLedger={() => onOpenLedger(current)} />

            <DetailSection
              title="Supplied medicines"
              action={<span className="num text-xs text-muted-foreground">{medicineRows.length} linked</span>}
            >
              {medicines.isLoading ? (
                <SkeletonTable rows={3} cols={4} />
              ) : medicines.error ? (
                <ErrorState
                  size="compact"
                  title="Couldn't load medicines"
                  message={medicines.error.message}
                  onRetry={() => void medicines.refetch()}
                />
              ) : medicineRows.length === 0 ? (
                <div className="rounded-lg border border-dashed">
                  <EmptyState
                    size="compact"
                    icon={Package}
                    title="No medicines from this supplier yet"
                    description="Add a medicine or bulk-import a price list to link products to this supplier."
                    action={{ label: "Add medicine", icon: Plus, onClick: () => setIsCreateMedicineOpen(true) }}
                  />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Medicine</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(expanded.medicines ? medicineRows : medicineRows.slice(0, PREVIEW_ROWS)).map((m) => {
                          const out = m.stock_quantity === 0
                          const low = !out && m.stock_quantity <= m.minimum_stock
                          return (
                            <TableRow key={m.id}>
                              <TableCell>
                                <div className="font-medium">{m.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {[m.strength, m.form].filter(Boolean).join(" · ") || m.generic_name || "—"}
                                </div>
                              </TableCell>
                              <TableCell className="num text-right">
                                {m.stock_quantity}
                                <div className="text-xs text-muted-foreground">min {m.minimum_stock}</div>
                              </TableCell>
                              <TableCell className="num text-right">
                                <CurrencyDisplay amount={Number(m.cost_price ?? 0)} />
                              </TableCell>
                              <TableCell className="num text-right font-medium">
                                <CurrencyDisplay amount={Number(m.unit_price ?? 0)} />
                              </TableCell>
                              <TableCell>
                                <Badge variant={out ? "danger" : low ? "warning" : "success"}>
                                  {out ? <XCircle aria-hidden /> : low ? <AlertTriangle aria-hidden /> : <CheckCircle2 aria-hidden />}
                                  {out ? "Out of stock" : low ? "Low stock" : "In stock"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <ShowAllToggle
                    total={medicineRows.length}
                    expanded={expanded.medicines}
                    onToggle={() => setExpanded((e) => ({ ...e, medicines: !e.medicines }))}
                  />
                </>
              )}
            </DetailSection>

            <DetailSection title="Cost history">
              {costs.isLoading ? (
                <SkeletonTable rows={3} cols={4} />
              ) : costs.error ? (
                <ErrorState size="compact" title="Couldn't load cost history" message={costs.error.message} onRetry={() => void costs.refetch()} />
              ) : (costs.data ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed">
                  <EmptyState
                    size="compact"
                    icon={TrendingUp}
                    title="No purchase receipts yet"
                    description="Unit costs appear here each time goods from this supplier are received."
                  />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Received</TableHead>
                          <TableHead>Medicine</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(expanded.costs ? costs.data! : costs.data!.slice(0, PREVIEW_ROWS)).map((row, i) => (
                          <TableRow key={`${row.medicine_id}-${row.receipt_date}-${i}`}>
                            <TableCell>
                              <DualDate utc={row.receipt_date} withTime={false} />
                            </TableCell>
                            <TableCell className="text-sm">{row.medicine_name}</TableCell>
                            <TableCell className="num text-right text-sm">{row.quantity_received}</TableCell>
                            <TableCell className="num text-right font-medium">
                              <CurrencyDisplay amount={row.unit_cost} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ShowAllToggle
                    total={costs.data!.length}
                    expanded={expanded.costs}
                    onToggle={() => setExpanded((e) => ({ ...e, costs: !e.costs }))}
                  />
                </>
              )}
            </DetailSection>

            <DetailSection
              title="Returns"
              action={
                <Button size="sm" variant="outline" asChild>
                  <Link href="/dashboard/returns/new">
                    <Undo2 aria-hidden />
                    New return
                  </Link>
                </Button>
              }
            >
              {returns.isLoading ? (
                <SkeletonTable rows={3} cols={5} />
              ) : returns.error ? (
                <ErrorState size="compact" title="Couldn't load returns" message={returns.error.message} onRetry={() => void returns.refetch()} />
              ) : returnRows.length === 0 ? (
                <div className="rounded-lg border border-dashed">
                  <EmptyState
                    size="compact"
                    icon={Undo2}
                    title="No returns to this supplier yet"
                    description="Stock sent back for being expired, damaged or recalled will be listed here."
                  />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Medicine</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(expanded.returns ? returnRows : returnRows.slice(0, PREVIEW_ROWS)).map((row) => (
                          <TableRow key={row.key}>
                            <TableCell>
                              <DualDate utc={row.date} withTime={false} />
                            </TableCell>
                            <TableCell className="text-sm">{row.medicineName}</TableCell>
                            <TableCell className="num text-right text-sm">{row.quantity}</TableCell>
                            <TableCell className="text-sm capitalize">{row.reason.replace(/_/g, " ")}</TableCell>
                            <TableCell className="num text-right font-medium">
                              <CurrencyDisplay amount={row.totalCost} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ShowAllToggle
                    total={returnRows.length}
                    expanded={expanded.returns}
                    onToggle={() => setExpanded((e) => ({ ...e, returns: !e.returns }))}
                  />
                </>
              )}
            </DetailSection>
          </>
        )}
      </DetailSheet>

      <CreateMedicineModal
        isOpen={isCreateMedicineOpen}
        onClose={() => setIsCreateMedicineOpen(false)}
        onCreate={() => {
          setIsCreateMedicineOpen(false)
          refreshMedicines()
        }}
        initialSupplierId={supplier?.id}
      />
      <BulkMedicineImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={() => {
          setIsBulkImportOpen(false)
          refreshMedicines()
        }}
        initialSupplierName={supplier?.name}
      />
    </>
  )
}
