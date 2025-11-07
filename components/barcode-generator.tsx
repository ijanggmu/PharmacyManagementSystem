/**
 * Barcode Generator Component
 * Generates and displays barcode labels
 */

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { generateEAN13, generateUPCA, validateBarcode } from "@/lib/utils/barcode"
import { Printer } from "lucide-react"

export function BarcodeGenerator() {
  const [data, setData] = useState("")
  const [type, setType] = useState<"EAN13" | "UPC" | "CODE128">("CODE128")
  const [barcode, setBarcode] = useState("")
  const [error, setError] = useState("")

  const handleGenerate = () => {
    setError("")
    try {
      let generated = ""
      if (type === "EAN13") {
        if (data.length !== 12) {
          throw new Error("EAN-13 requires 12 digits")
        }
        generated = generateEAN13(data)
      } else if (type === "UPC") {
        if (data.length !== 11) {
          throw new Error("UPC-A requires 11 digits")
        }
        generated = generateUPCA(data)
      } else {
        if (!validateBarcode(data, type)) {
          throw new Error("Invalid barcode data")
        }
        generated = data
      }
      setBarcode(generated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate barcode")
    }
  }

  const handlePrint = () => {
    if (!barcode) return
    window.print()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Barcode Generator</CardTitle>
        <CardDescription>Generate barcodes for inventory items</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="barcode-type">Barcode Type</Label>
          <Select value={type} onValueChange={(value: any) => setType(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CODE128">Code 128</SelectItem>
              <SelectItem value="EAN13">EAN-13</SelectItem>
              <SelectItem value="UPC">UPC-A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="barcode-data">Data</Label>
          <Input
            id="barcode-data"
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder={type === "EAN13" ? "12 digits" : type === "UPC" ? "11 digits" : "Enter data"}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleGenerate}>Generate Barcode</Button>

        {barcode && (
          <div className="space-y-2">
            <div className="p-4 border rounded-lg bg-white">
              <p className="text-sm font-mono text-center">{barcode}</p>
              {/* In production, render actual barcode image using jsbarcode */}
            </div>
            <Button onClick={handlePrint} variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print Label
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

