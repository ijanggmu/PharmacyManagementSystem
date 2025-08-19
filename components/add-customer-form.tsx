"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client" // Fixed import to use createClient
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function AddCustomerForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    dateOfBirth: "",
    insuranceInfo: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient() // Use createClient instead of imported supabase

      const { error } = await supabase.from("customers").insert({
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        date_of_birth: formData.dateOfBirth || null,
        insurance_info: formData.insuranceInfo ? JSON.parse(formData.insuranceInfo) : null,
      })

      if (error) {
        throw error
      }

      toast({
        title: "Success",
        description: "Customer added successfully",
      })

      router.push("/dashboard/customers")
    } catch (error) {
      console.error("Error adding customer:", error)
      toast({
        title: "Error",
        description: "Failed to add customer. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Personal Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => handleChange("firstName", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => handleChange("lastName", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dateOfBirth">Date of Birth</Label>
        <Input
          id="dateOfBirth"
          type="date"
          value={formData.dateOfBirth}
          onChange={(e) => handleChange("dateOfBirth", e.target.value)}
        />
      </div>

      {/* Contact Information */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insurance Information */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">Insurance Information</h3>
          <div className="space-y-2">
            <Label htmlFor="insuranceInfo">Insurance Details (JSON format)</Label>
            <Textarea
              id="insuranceInfo"
              value={formData.insuranceInfo}
              onChange={(e) => handleChange("insuranceInfo", e.target.value)}
              placeholder='{"provider": "Blue Cross", "policy_number": "12345", "group_number": "ABC123"}'
              rows={3}
            />
            <p className="text-sm text-gray-500">Enter insurance information in JSON format (optional)</p>
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex gap-4">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding Customer...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Add New Customer
            </>
          )}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/customers")} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
