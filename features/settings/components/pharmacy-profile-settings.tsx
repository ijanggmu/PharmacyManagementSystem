"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiGet, apiPatch, getCSRFToken, apiRequestErrorMessage } from "@/lib/api/client-helpers"

interface TenantProfile {
  id: string
  name: string
  legal_name: string | null
  license_number: string | null
  pan_vat_number: string | null
  country: string | null
}

export default function PharmacyProfileSettings() {
  const { toast } = useToast()
  const [profile, setProfile] = useState<TenantProfile | null>(null)
  const [legalName, setLegalName] = useState("")
  const [licenseNumber, setLicenseNumber] = useState("")
  const [panVatNumber, setPanVatNumber] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const data = await apiGet<TenantProfile>("/api/tenant/profile")
        if (data) {
          setProfile(data)
          setLegalName(data.legal_name || "")
          setLicenseNumber(data.license_number || "")
          setPanVatNumber(data.pan_vat_number || "")
        }
      } catch (error) {
        toast({ title: "Failed to load pharmacy profile", description: apiRequestErrorMessage(error), variant: "destructive" })
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
      const token = await getCSRFToken()
      const data = await apiPatch<TenantProfile>(
        "/api/tenant/profile",
        {
          legal_name: legalName.trim() || null,
          license_number: licenseNumber.trim() || null,
          pan_vat_number: panVatNumber.trim() || null,
        },
        token
      )
      setProfile(data)
      toast({ title: "Pharmacy profile saved" })
    } catch (error) {
      toast({ title: "Failed to save", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading pharmacy profile...</p>
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="space-y-1.5">
        <Label>Pharmacy Name</Label>
        <Input value={profile?.name || ""} disabled />
        <p className="text-xs text-muted-foreground">Contact support to change your registered pharmacy name.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="legal-name">Legal Name</Label>
        <Input
          id="legal-name"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          placeholder="As registered with the Department of Drug Administration"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="license-number">Pharmacy License Number</Label>
          <Input
            id="license-number"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="DDA registration number"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pan-vat-number">PAN/VAT Number</Label>
          <Input
            id="pan-vat-number"
            value={panVatNumber}
            onChange={(e) => setPanVatNumber(e.target.value)}
            placeholder="IRD registration number"
          />
          <p className="text-xs text-muted-foreground">Printed on invoices when set.</p>
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 mr-2" />
        {saving ? "Saving…" : "Save Profile"}
      </Button>
    </div>
  )
}
