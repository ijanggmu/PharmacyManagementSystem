"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogScrollBody, DialogStickyFooter, DialogTitle, DIALOG_CONTENT_SCROLL_BODY_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { Boxes, Check, ChevronsUpDown, History, Package, PackageMinus, PackagePlus, Pill, Plus, ShieldCheck, Truck, Wallet } from "lucide-react"
import { FieldHint, MedicineFormSection, RequiredMark } from "./medicine-form-section"
import { cn } from "@/lib/utils"
import { CurrencyDisplay } from "@/components/currency-display"
import { useQueryClient } from "@tanstack/react-query"
import { medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { validateMedicineEditForm, type MedicineFormErrors } from "@/lib/utils/medicine-form-validation"
import { AddStockDialog } from "@/features/medicines/components/add-stock-dialog"
import { AdjustStockDialog } from "@/features/medicines/components/adjust-stock-dialog"
import { FieldError } from "@/components/ui/field-error"
import { Medicine } from "@/features/medicines/api-client"
import { supplierNameSchema } from "@/lib/utils/validation"
import ConfirmNewSupplierDialog from "@/features/suppliers/components/confirm-new-supplier-dialog"
import { categoriesApi } from "@/features/medicines/api-client-categories"
import { suppliersApi } from "@/features/suppliers/api-client"
import { medicinesApi } from "@/features/medicines/api-client"
import { BarcodeField } from "@/features/medicines/components/barcode-field"
import { formUnits, priceBasisLabel, priceTextInNpr, type PriceCurrency } from "@/features/medicines/lib/price-entry"
import { PriceCurrencyToggle } from "@/features/medicines/components/price-entry-controls"
import { useCurrency } from "@/lib/contexts/currency-context"
import { hasLockedBox, hasStockHistory, withoutLockedFields } from "@/features/medicines/lib/medicine-edit-locks"
import { boxSummary } from "@/features/medicines/lib/box-unit"
import { ApprovalDialog } from "@/features/approvals/components/approval-dialog"
import type { ApprovalRequest } from "@/features/approvals/lib/approval"

interface EditMedicineModalProps {
  medicine: Medicine | null
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

export default function EditMedicineModal({ medicine, isOpen, onClose, onUpdate }: EditMedicineModalProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<Partial<Medicine>>({})
  const [fieldErrors, setFieldErrors] = useState<MedicineFormErrors>({})
  /** A selling price below cost by someone who can't approve that: save again with a manager's approval. */
  const [priceApproval, setPriceApproval] = useState<ApprovalRequest | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([])
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [showCreateCategory, setShowCreateCategory] = useState(false)
  const [showCreateSupplier, setShowCreateSupplier] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newSupplierName, setNewSupplierName] = useState("")
  const [supplierPendingConfirm, setSupplierPendingConfirm] = useState<string | null>(null)
  const [originalStock, setOriginalStock] = useState(0)
  const [originalPrices, setOriginalPrices] = useState({ unit: 0, cost: 0 })
  const [priceChangeReason, setPriceChangeReason] = useState("")
  const [stockDialog, setStockDialog] = useState<"add" | "adjust" | null>(null)
  // Strength, form and pack/unit are locked once stock is on record (the server refuses changes to them).
  const [stockLocked, setStockLocked] = useState(false)
  // An existing box locks with them; a medicine with stock but no box can still be given one.
  const boxLocked = medicine ? hasLockedBox(medicine, stockLocked) : false
  const { toast } = useToast()
  // Stored prices are per single unit; the label names it (tablet, capsule, …) so nobody types a strip price.
  const baseUnitName = priceBasisLabel("base", formUnits(formData))
  // Cost and selling price can each be typed in INR (an Indian bill); they are saved in NPR.
  const { currentCurrency } = useCurrency()
  const allowInr = currentCurrency.code === "NPR"
  const [costCurrency, setCostCurrency] = useState<PriceCurrency>("NPR")
  const [sellingCurrency, setSellingCurrency] = useState<PriceCurrency>("NPR")
  const sellingNpr = priceTextInNpr(String(formData.unit_price ?? ""), sellingCurrency, 2)
  const costNpr = priceTextInNpr(String(formData.cost_price ?? ""), costCurrency, 4)

  // Initialize form data when medicine changes
  useEffect(() => {
    setFieldErrors({})
    if (medicine) {
      setFormData({
        name: medicine.name || "",
        generic_name: medicine.generic_name || "",
        brand_name: medicine.brand_name || "",
        dosage: medicine.dosage || "",
        form: medicine.form || "",
        strength: medicine.strength || "",
        unit_price: medicine.unit_price || "",
        cost_price: medicine.cost_price || "",
        stock_quantity: medicine.stock_quantity ?? 0,
        minimum_stock: medicine.minimum_stock ?? 0,
        maximum_stock: medicine.maximum_stock ?? 0,
        expiry_date: medicine.expiry_date || "",
        prescription_required: medicine.prescription_required ?? false,
        barcode: medicine.barcode || "",
        side_effects: medicine.side_effects || "",
        storage_instructions: medicine.storage_instructions || "",
        category_id: medicine.category_id || "",
        supplier_id: medicine.supplier_id || "",
        is_taxable: medicine.is_taxable ?? true,
        requires_cold_chain: (medicine as any).requires_cold_chain ?? false,
        storage_temp_min_c: (medicine as any).storage_temp_min_c ?? "",
        storage_temp_max_c: (medicine as any).storage_temp_max_c ?? "",
        units_per_pack: (medicine as any).units_per_pack ?? "",
        unit_label: (medicine as any).unit_label ?? "",
        packs_per_box: medicine.packs_per_box ?? null,
        box_label: medicine.box_label ?? "",
      } as Partial<Medicine>)
      setOriginalStock(medicine.stock_quantity ?? 0)
      setOriginalPrices({ unit: Number(medicine.unit_price) || 0, cost: Number(medicine.cost_price) || 0 })
      setPriceChangeReason("")
      setStockLocked(hasStockHistory(medicine))
      loadCategoriesAndSuppliers()
    } else {
      // Reset to empty defaults when medicine is null
      setFormData({
        name: "",
        generic_name: "",
        brand_name: "",
        dosage: "",
        form: "",
        strength: "",
        unit_price: "",
        cost_price: "",
        stock_quantity: 0,
        minimum_stock: 0,
        maximum_stock: 0,
        expiry_date: "",
        prescription_required: false,
        barcode: "",
        side_effects: "",
        storage_instructions: "",
        category_id: "",
        supplier_id: "",
      })
    }
  }, [medicine])

  // A list row does not carry has_stock_history; the detail read does.
  useEffect(() => {
    if (!isOpen || !medicine) return
    let cancelled = false
    void medicinesApi.getMedicine(medicine.id).then(({ data }) => {
      if (!cancelled && data) setStockLocked(hasStockHistory(data))
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, medicine])

  const loadCategoriesAndSuppliers = async () => {
    const [categoriesResult, suppliersResult] = await Promise.all([
      categoriesApi.getCategories(),
      // Inactive too, so a medicine whose supplier was deactivated still shows its name.
      suppliersApi.getSupplierOptions({ includeInactive: true }),
    ])

    if (!categoriesResult.error) setCategories(categoriesResult.data)
    if (!suppliersResult.error) setSuppliers(suppliersResult.data)
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      })
      return
    }

    try {
      const { data, error } = await categoriesApi.createCategory(newCategoryName.trim())
      if (error || !data) throw new Error(error ?? "Failed to create category")

      setCategories([...categories, data])
      setFormData({ ...formData, category_id: data.id })
      setNewCategoryName("")
      setShowCreateCategory(false)
      setCategoryOpen(false)

      toast({
        title: "Success",
        description: "Category created successfully",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create category",
        variant: "destructive",
      })
    }
  }

  const askCreateSupplier = () => {
    const parsed = supplierNameSchema.safeParse(newSupplierName.trim())
    if (!parsed.success) {
      toast({
        title: "Invalid supplier name",
        description: parsed.error.issues[0]?.message || "Supplier name is required",
        variant: "destructive",
      })
      return
    }
    setSupplierPendingConfirm(parsed.data)
  }

  const handleCreateSupplier = async () => {
    const name = supplierPendingConfirm
    if (!name) return

    try {
      const { data, error } = await suppliersApi.createSupplier({
        name,
        contact_person: undefined,
        email: undefined,
        phone: undefined,
        address: undefined,
      })
      if (error || !data) throw new Error(error ?? "Failed to create supplier")

      setSuppliers([...suppliers, data])
      setFormData({ ...formData, supplier_id: data.id })
      setNewSupplierName("")
      setSupplierPendingConfirm(null)
      setShowCreateSupplier(false)
      setSupplierOpen(false)

      toast({
        title: "Success",
        description: "Supplier created successfully",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create supplier",
        variant: "destructive",
      })
    }
  }

  const pricesChanged =
    (Number(sellingNpr) || 0) !== originalPrices.unit || (Number(costNpr) || 0) !== originalPrices.cost

  /** After Add stock / Adjust stock: show the new on-hand without losing unsaved edits. */
  const refreshStock = async () => {
    if (!medicine) return
    const { data } = await medicinesApi.getMedicine(medicine.id)
    if (data) {
      setStockLocked(hasStockHistory(data))
      setOriginalStock(data.stock_quantity ?? 0)
      setFormData((prev) => ({ ...prev, stock_quantity: data.stock_quantity ?? 0 }))
    }
    window.dispatchEvent(new CustomEvent("refresh-medicines"))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await save()
  }

  const save = async (approvalTokens?: string[]) => {
    if (!medicine) return
    const errors = validateMedicineEditForm(formData)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      const firstError = document.getElementById(Object.keys(errors)[0])
      firstError?.focus()
      return
    }

    setIsLoading(true)
    try {
      const updateData = withoutLockedFields({
        ...formData,
        category_id: formData.category_id || null,
        supplier_id: formData.supplier_id || null,
        storage_temp_min_c: (formData.storage_temp_min_c as any) === "" ? null : Number(formData.storage_temp_min_c),
        storage_temp_max_c: (formData.storage_temp_max_c as any) === "" ? null : Number(formData.storage_temp_max_c),
        units_per_pack: (formData.units_per_pack as any) === "" ? null : Number(formData.units_per_pack),
        unit_label: formData.unit_label || null,
        // Blank removes the box (and so does removing the pack size it sits on).
        packs_per_box: formData.packs_per_box == null || (formData.packs_per_box as unknown) === "" ? null : Number(formData.packs_per_box),
        box_label: formData.box_label || null,
        // Stock changes only through Add stock / Adjust stock (batch-level, with the right postings).
        stock_quantity: undefined,
        // Always saved in NPR, whatever currency the prices were typed in.
        unit_price: sellingNpr,
        cost_price: costNpr,
        price_change_reason: pricesChanged ? priceChangeReason.trim() || null : null,
      }, stockLocked, boxLocked)

      const { error, approval } = await medicinesApi.updateMedicine(medicine.id, updateData, approvalTokens)
      if (approval) {
        setPriceApproval(approval)
        return
      }
      if (error) throw new Error(error)

      toast({
        title: "Success",
        description: "Medicine updated successfully",
      })

      // Invalidate medicine queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
      // A stock increase against a supplier posts a payable — refresh supplier
      // balances too (both the old and new supplier if it was reassigned).
      if (updateData.supplier_id) {
        queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
        queryClient.invalidateQueries({ queryKey: supplierKeys.detail(updateData.supplier_id) })
      }
      if (medicine.supplier_id && medicine.supplier_id !== updateData.supplier_id) {
        queryClient.invalidateQueries({ queryKey: supplierKeys.detail(medicine.supplier_id) })
      }

      // Trigger data refresh events for other components
      window.dispatchEvent(new CustomEvent("refresh-medicines"))
      window.dispatchEvent(new CustomEvent("refresh-data"))

      onUpdate()
      onClose()
    } catch (error) {
      console.error("Error updating medicine:", error)
      toast({
        title: "Error",
        // The server's reason (e.g. a barcode already used by another medicine) beats a generic message.
        description: error instanceof Error && error.message ? error.message : "Failed to update medicine",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (!medicine) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Only the body scrolls (the medicine card is taller than a short window); the buttons stay pinned. */}
      <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>Edit medicine</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogScrollBody className="space-y-5 py-4">
          <p className="text-xs text-muted-foreground">
            Fields marked <span className="text-destructive">*</span> are required.
          </p>

          <MedicineFormSection title="Identity" icon={Pill}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Medicine name<RequiredMark /></Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value })
                  if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: undefined })
                }}
                aria-invalid={!!fieldErrors.name}
                required
              />
              <FieldError message={fieldErrors.name} />
            </div>
            <div>
              <Label htmlFor="generic_name">Generic name</Label>
              <Input
                id="generic_name"
                value={formData.generic_name || ""}
                onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="brand_name">Brand name</Label>
              <Input
                id="brand_name"
                value={formData.brand_name || ""}
                onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="strength">Strength</Label>
              <Input
                id="strength"
                value={formData.strength || ""}
                onChange={(e) => {
                  setFormData({ ...formData, strength: e.target.value })
                  if (fieldErrors.strength) setFieldErrors({ ...fieldErrors, strength: undefined })
                }}
                readOnly={stockLocked}
                disabled={stockLocked}
                aria-invalid={!!fieldErrors.strength}
                aria-describedby={stockLocked ? "identity-locked-hint" : undefined}
              />
              <FieldError message={fieldErrors.strength} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="form">Form<RequiredMark /></Label>
              <Select
                value={formData.form || ""}
                onValueChange={(value) => {
                  setFormData({ ...formData, form: value })
                  if (fieldErrors.form) setFieldErrors({ ...fieldErrors, form: undefined })
                }}
                disabled={stockLocked}
              >
                <SelectTrigger
                  id="form"
                  aria-invalid={!!fieldErrors.form}
                  aria-describedby={stockLocked ? "identity-locked-hint" : undefined}
                >
                  <SelectValue placeholder="Select form" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tablet">Tablet</SelectItem>
                  <SelectItem value="capsule">Capsule</SelectItem>
                  <SelectItem value="syrup">Syrup</SelectItem>
                  <SelectItem value="injection">Injection</SelectItem>
                  <SelectItem value="cream">Cream</SelectItem>
                  <SelectItem value="drops">Drops</SelectItem>
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.form} />
            </div>
            <div>
              <Label htmlFor="category_id">Category</Label>
              <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryOpen}
                    className="w-full justify-between"
                  >
                    {formData.category_id
                      ? categories.find((category) => category.id === formData.category_id)?.name
                      : "Select category..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search categories..." />
                    <CommandList>
                      <CommandEmpty>
                        <div className="py-2 text-center text-sm">
                          <p className="mb-2">No category found.</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowCreateCategory(true)
                            }}
                            className="w-full"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Create new category
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            setFormData({ ...formData, category_id: "" })
                            setCategoryOpen(false)
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", formData.category_id === "" ? "opacity-100" : "opacity-0")} />
                          None
                        </CommandItem>
                        {categories.map((category) => (
                          <CommandItem
                            key={category.id}
                            value={category.name}
                            onSelect={() => {
                              setFormData({ ...formData, category_id: category.id })
                              setCategoryOpen(false)
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", formData.category_id === category.id ? "opacity-100" : "opacity-0")} />
                            {category.name}
                          </CommandItem>
                        ))}
                        <CommandItem
                          value="__create_category__"
                          onSelect={() => {
                            setShowCreateCategory(true)
                          }}
                          className="border-t"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Create new category
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <BarcodeField
              value={formData.barcode || ""}
              onChange={(barcode) => setFormData((prev) => ({ ...prev, barcode }))}
              medicineName={formData.name || ""}
              strength={formData.strength}
              price={sellingNpr}
            />
          </div>
          {stockLocked && (
            <FieldHint id="identity-locked-hint">
              Strength and form are locked: stock and bills on record are for this product. For a different strength or form, add it as a new medicine.
            </FieldHint>
          )}
          </MedicineFormSection>

          <MedicineFormSection title="Packaging" icon={Package} description="How it comes from the supplier. Stock and prices are per single unit; strips and boxes are for entry and sale.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="units_per_pack">Units per pack</Label>
              <Input
                id="units_per_pack"
                type="number"
                min={1}
                value={(formData as any).units_per_pack ?? ""}
                onChange={(e) => setFormData({ ...formData, units_per_pack: e.target.value as any })}
                placeholder="e.g., 10"
                readOnly={stockLocked}
                disabled={stockLocked}
                aria-describedby={stockLocked ? "pack-locked-hint" : undefined}
              />
            </div>
            <div>
              <Label htmlFor="unit_label">Unit label</Label>
              <Input
                id="unit_label"
                value={(formData as any).unit_label || ""}
                onChange={(e) => setFormData({ ...formData, unit_label: e.target.value as any })}
                placeholder="e.g., tablet, strip"
                readOnly={stockLocked}
                disabled={stockLocked}
                aria-describedby={stockLocked ? "pack-locked-hint" : undefined}
              />
            </div>
          </div>
          {stockLocked && (
            <FieldHint id="pack-locked-hint">
              Locked: stock on record is counted in this unit. For a different pack size, add it as a new medicine.
            </FieldHint>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="packs_per_box">Strips per box</Label>
              <Input
                id="packs_per_box"
                type="number"
                min={2}
                value={formData.packs_per_box ?? ""}
                onChange={(e) => {
                  setFormData({ ...formData, packs_per_box: e.target.value as unknown as number })
                  if (fieldErrors.packs_per_box) setFieldErrors({ ...fieldErrors, packs_per_box: undefined })
                }}
                placeholder="e.g., 10"
                readOnly={boxLocked}
                disabled={boxLocked || !(formData as any).units_per_pack}
                aria-invalid={!!fieldErrors.packs_per_box}
                aria-describedby="box-hint"
              />
              <FieldError message={fieldErrors.packs_per_box} />
            </div>
            <div>
              <Label htmlFor="box_label">Box label</Label>
              <Input
                id="box_label"
                value={formData.box_label || ""}
                onChange={(e) => setFormData({ ...formData, box_label: e.target.value })}
                placeholder="Box"
                maxLength={50}
                readOnly={boxLocked}
                disabled={boxLocked || !(formData as any).units_per_pack || !formData.packs_per_box}
                aria-describedby="box-hint"
              />
              <FieldError message={fieldErrors.box_label} />
            </div>
          </div>
          <FieldHint id="box-hint">
            {boxLocked
              ? `Locked: sales and purchases on record were entered in this box. ${boxSummary((formData as any).units_per_pack, formData.packs_per_box, formData.box_label, (formData as any).unit_label, formData.form) ?? ""}`.trim()
              : boxSummary((formData as any).units_per_pack, formData.packs_per_box, formData.box_label, (formData as any).unit_label, formData.form)
                ?? "Optional. A box of whole strips for faster entry; stock stays counted in single units."}
          </FieldHint>
          </MedicineFormSection>

          <MedicineFormSection title="Pricing & tax" icon={Wallet} description="Selling price is what the customer pays, including VAT.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="unit_price">Selling price per {baseUnitName} (incl. VAT)<RequiredMark /></Label>
              <div className="flex gap-2">
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                value={formData.unit_price || ""}
                onChange={(e) => {
                  setFormData({ ...formData, unit_price: e.target.value })
                  if (fieldErrors.unit_price) setFieldErrors({ ...fieldErrors, unit_price: undefined })
                }}
                aria-invalid={!!fieldErrors.unit_price}
                required
              />
              {allowInr && <PriceCurrencyToggle label="Selling price currency" value={sellingCurrency} onChange={setSellingCurrency} />}
              </div>
              {sellingCurrency === "INR" && Number(sellingNpr) > 0 && (
                <FieldHint>
                  Saved as <CurrencyDisplay amount={Number(sellingNpr)} /> per {baseUnitName}
                </FieldHint>
              )}
              <FieldHint>Tax is calculated from this price when &ldquo;Taxable&rdquo; is on — don&apos;t add tax on top.</FieldHint>
              <FieldError message={fieldErrors.unit_price} />
            </div>
            <div>
              <Label htmlFor="cost_price">Cost price per {baseUnitName}<RequiredMark /></Label>
              <div className="flex gap-2">
              <Input
                id="cost_price"
                type="number"
                step="0.01"
                value={formData.cost_price || ""}
                onChange={(e) => {
                  setFormData({ ...formData, cost_price: e.target.value })
                  if (fieldErrors.cost_price) setFieldErrors({ ...fieldErrors, cost_price: undefined })
                }}
                aria-invalid={!!fieldErrors.cost_price}
                required
              />
              {allowInr && <PriceCurrencyToggle label="Cost price currency" value={costCurrency} onChange={setCostCurrency} />}
              </div>
              {costCurrency === "INR" && Number(costNpr) > 0 && (
                <FieldHint>
                  Saved as <CurrencyDisplay amount={Number(costNpr)} /> per {baseUnitName}
                </FieldHint>
              )}
              <FieldError message={fieldErrors.cost_price} />
            </div>
          </div>

          {pricesChanged && (
            <div className="rounded-lg border border-info/25 bg-info/5 p-3">
              <Label htmlFor="price_change_reason" className="flex items-center gap-1.5">
                <History className="size-4 text-info" aria-hidden />
                Reason for price change
              </Label>
              <Input
                id="price_change_reason"
                value={priceChangeReason}
                onChange={(e) => setPriceChangeReason(e.target.value)}
                placeholder="e.g. New MRP from supplier"
                maxLength={500}
                className="mt-1.5"
                aria-describedby="price_change_reason-hint"
              />
              <FieldHint id="price_change_reason-hint">
                Saved in the price history. Batches already in stock keep the cost they were bought at, so the books don&apos;t change.
              </FieldHint>
            </div>
          )}

          {/* Margin Display */}
          {Number(sellingNpr) > 0 && Number(costNpr) > 0 && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Margin per {baseUnitName}</p>
                <p className="text-sm font-semibold text-primary">
                  <CurrencyDisplay amount={Number(sellingNpr) - Number(costNpr)} />
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Margin %</p>
                <p className="text-sm font-semibold text-primary">
                  {Number(sellingNpr) > Number(costNpr)
                    ? `${(((Number(sellingNpr) - Number(costNpr)) / Number(costNpr)) * 100).toFixed(2)}%`
                    : "0%"}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Switch
                id="is_taxable"
                checked={formData.is_taxable ?? true}
                onCheckedChange={(checked) => setFormData({ ...formData, is_taxable: checked })}
                aria-describedby="is_taxable-hint"
              />
              <Label htmlFor="is_taxable">Taxable</Label>
            </div>
            <FieldHint id="is_taxable-hint">
              {stockLocked
                ? "A change applies to sales and purchases from now on. Past bills, and returns of stock already bought, keep the VAT they were recorded with."
                : "Turn off for VAT-exempt medicines. When on, VAT is worked out from the selling price."}
            </FieldHint>
          </div>
          </MedicineFormSection>

          <MedicineFormSection title="Stock & batch" icon={Boxes} description="Stock is held in batches, each with its own expiry and cost.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="stock_quantity">Current stock</Label>
              <div
                id="stock_quantity"
                className="flex h-10 items-center justify-between rounded-md border border-dashed bg-muted/40 px-3 text-sm"
                aria-describedby="stock_quantity-hint"
              >
                <span className="font-semibold tabular-nums">{formData.stock_quantity ?? 0}</span>
                <span className="text-xs text-muted-foreground">all branches</span>
              </div>
              <FieldHint id="stock_quantity-hint">Changes through Add stock or Adjust, batch by batch.</FieldHint>
            </div>
            <div>
              <Label htmlFor="minimum_stock">Reorder level (minimum stock)<RequiredMark /></Label>
              <Input
                id="minimum_stock"
                type="number"
                value={formData.minimum_stock != null ? String(formData.minimum_stock) : ""}
                onChange={(e) => {
                  setFormData({ ...formData, minimum_stock: Number.parseInt(e.target.value) || 0 })
                  if (fieldErrors.minimum_stock) setFieldErrors({ ...fieldErrors, minimum_stock: undefined })
                }}
                aria-invalid={!!fieldErrors.minimum_stock}
                required
                aria-describedby="minimum_stock-hint"
              />
              <FieldHint id="minimum_stock-hint">Shown as low stock at or below this quantity.</FieldHint>
              <FieldError message={fieldErrors.minimum_stock} />
            </div>
            <div>
              <Label htmlFor="maximum_stock">Maximum stock<RequiredMark /></Label>
              <Input
                id="maximum_stock"
                type="number"
                value={formData.maximum_stock != null ? String(formData.maximum_stock) : ""}
                onChange={(e) => {
                  setFormData({ ...formData, maximum_stock: Number.parseInt(e.target.value) || 0 })
                  if (fieldErrors.maximum_stock) setFieldErrors({ ...fieldErrors, maximum_stock: undefined })
                }}
                aria-invalid={!!fieldErrors.maximum_stock}
                required
              />
              <FieldError message={fieldErrors.maximum_stock} />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Deliveries go in as a new batch; damage, expiry and count corrections are adjusted per batch and posted to the books.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setStockDialog("adjust")} className="min-h-9">
                <PackageMinus className="mr-1.5 size-4" aria-hidden />
                Adjust
              </Button>
              <Button type="button" size="sm" onClick={() => setStockDialog("add")} className="min-h-9">
                <PackagePlus className="mr-1.5 size-4" aria-hidden />
                Add stock
              </Button>
            </div>
          </div>

          </MedicineFormSection>

          <MedicineFormSection title="Supplier" icon={Truck}>
            <div>
              <Label htmlFor="supplier_id">Supplier</Label>
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={supplierOpen}
                    className="w-full justify-between"
                  >
                    {formData.supplier_id
                      ? suppliers.find((supplier) => supplier.id === formData.supplier_id)?.name
                      : "Select supplier..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search suppliers..." />
                    <CommandList>
                      <CommandEmpty>
                        <div className="py-2 text-center text-sm">
                          <p className="mb-2">No supplier found.</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowCreateSupplier(true)
                            }}
                            className="w-full"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Create new supplier
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            setFormData({ ...formData, supplier_id: "" })
                            setSupplierOpen(false)
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", formData.supplier_id === "" ? "opacity-100" : "opacity-0")} />
                          None
                        </CommandItem>
                        {suppliers.map((supplier) => (
                          <CommandItem
                            key={supplier.id}
                            value={supplier.name}
                            onSelect={() => {
                              setFormData({ ...formData, supplier_id: supplier.id })
                              setSupplierOpen(false)
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", formData.supplier_id === supplier.id ? "opacity-100" : "opacity-0")} />
                            {supplier.name}
                          </CommandItem>
                        ))}
                        <CommandItem
                          value="__create_supplier__"
                          onSelect={() => {
                            setShowCreateSupplier(true)
                          }}
                          className="border-t"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Create new supplier
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </MedicineFormSection>

          <MedicineFormSection title="Storage & safety" icon={ShieldCheck}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="prescription_required"
                checked={formData.prescription_required || false}
                onCheckedChange={(checked) => setFormData({ ...formData, prescription_required: checked })}
              />
              <Label htmlFor="prescription_required">Prescription required</Label>
            </div>
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <Switch
                  id="requires_cold_chain"
                  checked={(formData as any).requires_cold_chain || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, requires_cold_chain: checked as any })}
                />
                <Label htmlFor="requires_cold_chain">Needs cold chain</Label>
              </div>
            </div>
          </div>

          {(formData as any).requires_cold_chain && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="storage_temp_min_c">Min temp (°C)</Label>
                <Input
                  id="storage_temp_min_c"
                  type="number"
                  step="0.1"
                  value={(formData as any).storage_temp_min_c ?? ""}
                  onChange={(e) => setFormData({ ...formData, storage_temp_min_c: e.target.value as any })}
                  placeholder="e.g., 2"
                />
              </div>
              <div>
                <Label htmlFor="storage_temp_max_c">Max temp (°C)</Label>
                <Input
                  id="storage_temp_max_c"
                  type="number"
                  step="0.1"
                  value={(formData as any).storage_temp_max_c ?? ""}
                  onChange={(e) => setFormData({ ...formData, storage_temp_max_c: e.target.value as any })}
                  placeholder="e.g., 8"
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="dosage">Dosage instructions</Label>
            <Textarea
              id="dosage"
              value={formData.dosage || ""}
              onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="side_effects">Side effects</Label>
            <Textarea
              id="side_effects"
              value={formData.side_effects || ""}
              onChange={(e) => setFormData({ ...formData, side_effects: e.target.value })}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="storage_instructions">Storage instructions</Label>
            <Textarea
              id="storage_instructions"
              value={formData.storage_instructions || ""}
              onChange={(e) => setFormData({ ...formData, storage_instructions: e.target.value })}
              rows={2}
            />
          </div>
          </MedicineFormSection>

          </DialogScrollBody>

          <DialogStickyFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading} loadingText="Saving…">
              Save changes
            </Button>
          </DialogStickyFooter>
        </form>
      </DialogContent>

      {/* Create Category Dialog */}
      <Dialog open={showCreateCategory} onOpenChange={setShowCreateCategory}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create new category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="newCategoryName">Category name<RequiredMark /></Label>
              <Input
                id="newCategoryName"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter category name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleCreateCategory()
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateCategory(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCategory}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Supplier Dialog */}
      <Dialog open={showCreateSupplier} onOpenChange={setShowCreateSupplier}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create new supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="newSupplierName">Supplier name<RequiredMark /></Label>
              <Input
                id="newSupplierName"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="Enter supplier name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    askCreateSupplier()
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateSupplier(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={askCreateSupplier}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmNewSupplierDialog
        open={supplierPendingConfirm !== null}
        supplierNames={supplierPendingConfirm ? [supplierPendingConfirm] : []}
        onOpenChange={(open) => {
          if (!open) setSupplierPendingConfirm(null)
        }}
        onConfirm={() => void handleCreateSupplier()}
      />
      <AddStockDialog
        medicine={stockDialog === "add" ? medicine : null}
        isOpen={stockDialog === "add"}
        onClose={() => setStockDialog(null)}
        onAdded={() => void refreshStock()}
      />
      <AdjustStockDialog
        medicine={stockDialog === "adjust" ? medicine : null}
        isOpen={stockDialog === "adjust"}
        onClose={() => setStockDialog(null)}
        onAdjusted={() => void refreshStock()}
      />
      <ApprovalDialog
        request={priceApproval}
        onCancel={() => setPriceApproval(null)}
        onApproved={(token) => {
          setPriceApproval(null)
          void save([token])
        }}
      />
    </Dialog>
  )
}
