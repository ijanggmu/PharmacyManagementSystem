"use client"

import { useMemo, useState } from "react"
import { Loader2, Printer, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useCurrency } from "@/lib/contexts/currency-context"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { medicinesApi } from "@/features/medicines/api-client"
import { barcodeSvg, barcodeSymbology, buildBarcodeLabelsHtml } from "@/features/medicines/lib/barcode-label"

interface BarcodeFieldProps {
  value: string
  onChange: (value: string) => void
  /** Printed on the label next to the barcode. */
  medicineName: string
  strength?: string | null
  /** Selling price for the label; omitted when not set. */
  price?: number | string | null
  disabled?: boolean
}

/**
 * Barcode input for the medicine forms: type or scan the manufacturer's code, or generate an
 * in-store EAN-13 for medicines that have none, preview it, and print shelf/pack labels.
 * Uniqueness is enforced when the medicine is saved.
 */
export function BarcodeField({ value, onChange, medicineName, strength, price, disabled }: BarcodeFieldProps) {
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const [generating, setGenerating] = useState(false)
  const [copies, setCopies] = useState("1")

  const code = value.trim()
  const preview = useMemo(() => (code ? barcodeSvg(code, { height: 36 }) : null), [code])

  const handleGenerate = async () => {
    setGenerating(true)
    const { data, error } = await medicinesApi.generateBarcode()
    setGenerating(false)
    if (error || !data) {
      toast({ title: "Couldn't generate a barcode", description: error ?? undefined, variant: "destructive" })
      return
    }
    onChange(data)
  }

  const handlePrint = async () => {
    const priceValue = price === null || price === undefined || price === "" ? null : Number(price)
    const html = buildBarcodeLabelsHtml(
      [
        {
          name: medicineName.trim() || "Medicine",
          strength,
          price: priceValue !== null && Number.isFinite(priceValue) && priceValue > 0 ? formatCurrency(priceValue) : null,
          barcode: code,
        },
      ],
      Number.parseInt(copies) || 1,
    )
    if (!html) {
      toast({ title: "This barcode can't be printed", variant: "destructive" })
      return
    }
    try {
      await printHtmlDocument(html)
    } catch (error) {
      toast({
        title: "Printing failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="barcode">Barcode</Label>
      <div className="flex gap-2">
        <Input
          id="barcode"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Scan or type, or generate one"
          autoComplete="off"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleGenerate}
          disabled={disabled || generating || !!code}
          title={code ? "Clear the barcode to generate a new one" : "Generate an in-store barcode"}
        >
          {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          <span className="sr-only sm:not-sr-only sm:ml-1">Generate</span>
        </Button>
      </div>
      {code && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-white p-2">
          {preview ? (
            // SVG produced by JsBarcode from the barcode text only.
            <div className="max-w-[220px] text-black" dangerouslySetInnerHTML={{ __html: preview }} />
          ) : (
            <p className="text-xs text-destructive">This barcode can't be drawn. Check it for typos.</p>
          )}
          {preview && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{barcodeSymbology(code) === "EAN13" ? "EAN-13" : "Code 128"}</span>
              <Input
                aria-label="Number of labels"
                type="number"
                min={1}
                max={500}
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
                className="h-8 w-16"
              />
              <Button type="button" size="sm" variant="outline" onClick={handlePrint}>
                <Printer className="mr-1 size-4" />
                Print labels
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
