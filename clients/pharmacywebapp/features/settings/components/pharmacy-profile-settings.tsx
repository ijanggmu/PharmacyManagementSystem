"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { settingsApi } from "@/features/settings/api-client"

/**
 * Pharmacy profile fields are stored in the same tenant settings key/value store that
 * backs system-settings.tsx (auto_reorder_enabled, receipt footer, …). The store has no
 * dedicated profile table on the .NET API, so legal name / license number / PAN-VAT
 * number are just settings rows under the "pharmacy.*" namespace.
 */
const LEGAL_NAME_KEY = "pharmacy.legal_name"
const LICENSE_NUMBER_KEY = "pharmacy.license_number"
const VAT_NUMBER_KEY = "pharmacy.vat_number"

export default function PharmacyProfileSettings() {
  const { toast } = useToast()
  const [legalName, setLegalName] = useState("")
  const [licenseNumber, setLicenseNumber] = useState("")
  const [panVatNumber, setPanVatNumber] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const { data, error } = await settingsApi.list()
        if (error) throw new Error(error)
        const byKey = new Map(data.map((row) => [row.key, row.value]))
        setLegalName(byKey.get(LEGAL_NAME_KEY) ?? "")
        setLicenseNumber(byKey.get(LICENSE_NUMBER_KEY) ?? "")
        setPanVatNumber(byKey.get(VAT_NUMBER_KEY) ?? "")
      } catch (error) {
        toast({
          title: "Failed to load pharmacy profile",
          description: error instanceof Error ? error.message : "Failed to load pharmacy profile",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const results = await Promise.all([
        settingsApi.upsert(LEGAL_NAME_KEY, legalName),
        settingsApi.upsert(LICENSE_NUMBER_KEY, licenseNumber),
        settingsApi.upsert(VAT_NUMBER_KEY, panVatNumber),
      ])
      const firstError = results.find((r) => r.error)?.error
      if (firstError) throw new Error(firstError)
      toast({ title: "Pharmacy profile saved", description: "Legal name, license and tax numbers have been updated." })
    } catch (error) {
      toast({
        title: "Failed to save",
        description: error instanceof Error ? error.message : "Failed to save pharmacy profile",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-xl space-y-4" aria-busy="true">
        <span className="sr-only">Loading pharmacy profile</span>
        <Skeleton variant="text" className="w-24" />
        <Skeleton className="h-9" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      </div>
    )
  }

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void handleSave()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="legal-name">Legal name</Label>
        <Input
          id="legal-name"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          placeholder="e.g. Sagarmatha Pharmacy Pvt. Ltd."
          aria-describedby="legal-name-help"
        />
        <p id="legal-name-help" className="text-xs text-muted-foreground">
          As registered with the Department of Drug Administration.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="license-number">Pharmacy license number</Label>
          <Input
            id="license-number"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="DDA registration number"
            aria-describedby="license-number-help"
          />
          <p id="license-number-help" className="text-xs text-muted-foreground">
            Your DDA pharmacy registration number.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pan-vat-number">PAN/VAT number</Label>
          <Input
            id="pan-vat-number"
            value={panVatNumber}
            onChange={(e) => setPanVatNumber(e.target.value)}
            placeholder="IRD registration number"
            inputMode="numeric"
            aria-describedby="pan-vat-help"
          />
          <p id="pan-vat-help" className="text-xs text-muted-foreground">
            9-digit IRD number. Printed on invoices when set.
          </p>
        </div>
      </div>
      <Button type="submit" loading={saving} loadingText="Saving…">
        <Save aria-hidden />
        Save changes
      </Button>
    </form>
  )
}
