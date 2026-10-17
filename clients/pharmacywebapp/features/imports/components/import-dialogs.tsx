"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyDisplay } from "@/components/currency-display"
import { customerKeys } from "@/features/customers/hooks/use-customers"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { importsApi, type PartyImportOptions, type StockImportOptions } from "@/features/imports/api-client"
import { SpreadsheetImportDialog } from "@/features/imports/components/spreadsheet-import-dialog"
import {
  CUSTOMER_IMPORT_COLUMNS,
  CUSTOMER_IMPORT_EXAMPLES,
  CUSTOMER_IMPORT_NOTES,
  mapCustomerRows,
} from "@/features/imports/lib/customer-import"
import {
  SUPPLIER_IMPORT_COLUMNS,
  SUPPLIER_IMPORT_EXAMPLES,
  SUPPLIER_IMPORT_NOTES,
  mapSupplierRows,
} from "@/features/imports/lib/supplier-import"
import { STOCK_IMPORT_COLUMNS, STOCK_IMPORT_EXAMPLES, STOCK_IMPORT_NOTES, mapStockRows } from "@/features/imports/lib/stock-import"
import type { DuplicateMode, StockImportMode } from "@/features/imports/types"
import { SupplierSelect } from "@/features/suppliers/components/supplier-select"

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PARTY_DEFAULTS: PartyImportOptions = { duplicateMode: "skip", asOfDate: "" }
const STOCK_DEFAULTS: StockImportOptions = { funding: "opening_stock", asOfDate: "" }

function PartyOptions({
  options,
  setOptions,
  disabled,
  existingLabel,
  balanceLabel,
}: {
  options: PartyImportOptions
  setOptions: (options: PartyImportOptions) => void
  disabled: boolean
  existingLabel: string
  balanceLabel: string
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="import-duplicate-mode">{existingLabel}</Label>
        <Select
          value={options.duplicateMode}
          onValueChange={(value) => setOptions({ ...options, duplicateMode: value as DuplicateMode })}
          disabled={disabled}
        >
          <SelectTrigger id="import-duplicate-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="skip">Skip them (leave as they are)</SelectItem>
            <SelectItem value="update">Update them with the file&apos;s non-blank values</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="import-as-of">{balanceLabel}</Label>
        <DatePicker
          id="import-as-of"
          value={options.asOfDate ?? ""}
          onChange={(value) => setOptions({ ...options, asOfDate: value })}
          placeholder="Today"
          clearable
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">Used for rows without their own as-of date.</p>
      </div>
    </div>
  )
}

export function CustomerImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const queryClient = useQueryClient()
  return (
    <SpreadsheetImportDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import customers"
      description="Add many customers at once from Excel or CSV, with their opening dues."
      kind="customers"
      noun="customer"
      columns={CUSTOMER_IMPORT_COLUMNS}
      previewKeys={["name", "phone", "pan", "opening_balance", "as_of_date"]}
      examples={CUSTOMER_IMPORT_EXAMPLES}
      notes={CUSTOMER_IMPORT_NOTES}
      mapRows={mapCustomerRows}
      defaultOptions={PARTY_DEFAULTS}
      renderOptions={(options, setOptions, disabled) => (
        <PartyOptions
          options={options}
          setOptions={setOptions}
          disabled={disabled}
          existingLabel="Customers already on file (same phone or PAN)"
          balanceLabel="Opening balances as of"
        />
      )}
      submit={importsApi.customers}
      onImported={() => queryClient.invalidateQueries({ queryKey: customerKeys.all })}
    />
  )
}

export function SupplierImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const queryClient = useQueryClient()
  return (
    <SpreadsheetImportDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import suppliers"
      description="Add many suppliers at once from Excel or CSV, with what you owe each of them."
      kind="suppliers"
      noun="supplier"
      columns={SUPPLIER_IMPORT_COLUMNS}
      previewKeys={["name", "pan", "phone", "credit_days", "opening_balance"]}
      examples={SUPPLIER_IMPORT_EXAMPLES}
      notes={SUPPLIER_IMPORT_NOTES}
      mapRows={mapSupplierRows}
      defaultOptions={PARTY_DEFAULTS}
      renderOptions={(options, setOptions, disabled) => (
        <PartyOptions
          options={options}
          setOptions={setOptions}
          disabled={disabled}
          existingLabel="Suppliers already on file (same PAN or name)"
          balanceLabel="Opening payables as of"
        />
      )}
      submit={importsApi.suppliers}
      onImported={() => queryClient.invalidateQueries({ queryKey: supplierKeys.all })}
    />
  )
}

export function StockImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const queryClient = useQueryClient()
  return (
    <SpreadsheetImportDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import stock"
      description="Receive stock for medicines already in your list — opening stock at go-live, stock bought without a supplier bill, or a supplier's consignment."
      kind="stock"
      noun="stock line"
      columns={STOCK_IMPORT_COLUMNS}
      previewKeys={["barcode", "medicine_name", "strength", "batch_no", "expiry_date", "quantity", "cost_price"]}
      examples={STOCK_IMPORT_EXAMPLES}
      notes={STOCK_IMPORT_NOTES}
      mapRows={mapStockRows}
      defaultOptions={STOCK_DEFAULTS}
      renderOptions={(options, setOptions, disabled) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="import-funding">How was this stock paid for?</Label>
            <Select
              value={options.funding}
              onValueChange={(value) => setOptions({ ...options, funding: value as StockImportMode })}
              disabled={disabled}
            >
              <SelectTrigger id="import-funding">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opening_stock">Opening stock (already owned at go-live)</SelectItem>
                <SelectItem value="cash">Paid in cash (no supplier bill)</SelectItem>
                <SelectItem value="bank">Paid by bank / wallet (no supplier bill)</SelectItem>
                <SelectItem value="consignment">Consignment — the supplier&apos;s stock, paid when sold</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {options.funding === "consignment"
                ? "No accounting entry now. Consignment › Settle bills the supplier for what sold."
                : "Opening stock posts Inventory against Owner's Equity; paid stock against Cash or Bank."}
            </p>
          </div>
          {options.funding === "consignment" ? (
            <div className="space-y-2">
              <Label htmlFor="import-consignment-supplier">Consignment supplier</Label>
              <SupplierSelect
                id="import-consignment-supplier"
                value={options.supplierId}
                onValueChange={(supplierId) => setOptions({ ...options, supplierId })}
                placeholder="Choose supplier"
                disabled={disabled}
                aria-describedby="import-consignment-supplier-help"
              />
              <p id="import-consignment-supplier-help" className="text-xs text-muted-foreground">
                Every row is received as this supplier&apos;s consigned stock, each in its own batch.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="import-stock-as-of">Stock as of</Label>
              <DatePicker
                id="import-stock-as-of"
                value={options.asOfDate ?? ""}
                onChange={(value) => setOptions({ ...options, asOfDate: value })}
                placeholder="Today"
                clearable
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">Dates the accounting entry.</p>
            </div>
          )}
        </div>
      )}
      submit={importsApi.openingStock}
      onImported={() => queryClient.invalidateQueries({ queryKey: medicineKeys.all })}
      summaryExtra={(result) =>
        result.totalValue !== undefined ? (
          <p className="text-sm text-muted-foreground">
            Stock value: <CurrencyDisplay amount={result.totalValue} />
          </p>
        ) : null
      }
    />
  )
}
