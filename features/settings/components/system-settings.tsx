"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useCurrency, SUPPORTED_CURRENCIES } from "@/lib/contexts/currency-context"

export default function SystemSettings() {
  const { toast } = useToast()
  const { currentCurrency, setCurrency } = useCurrency()
  
  const [settings, setSettings] = useState({
    pharmacyName: "PharmaCare Pharmacy",
    pharmacyAddress: "123 Main Street, Healthcare City, HC 12345",
    pharmacyPhone: "+977-1-4XXXXXX",
    pharmacyEmail: "info@pharmacare.com",
    taxRate: "13.00",
    lowStockThreshold: "10",
    autoReorderEnabled: false,
    backupFrequency: "manual",
    receiptFooter: "Thank you for choosing PharmaCare!",
  })

  useEffect(() => {
    // Load settings from localStorage or database
    const savedSettings = localStorage.getItem("pharmacy-settings")
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings)
      setSettings(prev => ({ ...prev, ...parsed }))
    }
  }, [])

  const handleSave = () => {
    // Save settings to localStorage (in a real app, save to database)
    localStorage.setItem("pharmacy-settings", JSON.stringify(settings))
    
    toast({
      title: "Settings Saved",
      description: "System settings have been updated successfully",
    })
  }

  const handleCurrencyChange = (currencyCode: string) => {
    const selectedCurrency = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode)
    if (selectedCurrency) {
      setCurrency(selectedCurrency)
      toast({
        title: "Currency Updated",
        description: `Currency changed to ${selectedCurrency.name}`,
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Pharmacy Information */}
      <Card>
        <CardHeader>
          <CardTitle>Pharmacy Information</CardTitle>
          <CardDescription>Basic information about your pharmacy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pharmacyName">Pharmacy Name</Label>
              <Input
                id="pharmacyName"
                value={settings.pharmacyName}
                onChange={(e) => setSettings((prev) => ({ ...prev, pharmacyName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pharmacyPhone">Phone Number</Label>
              <Input
                id="pharmacyPhone"
                value={settings.pharmacyPhone}
                onChange={(e) => setSettings((prev) => ({ ...prev, pharmacyPhone: e.target.value }))}
                placeholder="+977-1-4XXXXXX"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pharmacyAddress">Address</Label>
            <Textarea
              id="pharmacyAddress"
              value={settings.pharmacyAddress}
              onChange={(e) => setSettings((prev) => ({ ...prev, pharmacyAddress: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pharmacyEmail">Email Address</Label>
            <Input
              id="pharmacyEmail"
              type="email"
              value={settings.pharmacyEmail}
              onChange={(e) => setSettings((prev) => ({ ...prev, pharmacyEmail: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Business Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Business Settings</CardTitle>
          <CardDescription>Configure business rules and preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taxRate">Tax Rate (%)</Label>
              <Input
                id="taxRate"
                type="number"
                step="0.01"
                value={settings.taxRate}
                onChange={(e) => setSettings((prev) => ({ ...prev, taxRate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={currentCurrency.code}
                onValueChange={handleCurrencyChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} ({currency.symbol}) - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
              <Input
                id="lowStockThreshold"
                type="number"
                value={settings.lowStockThreshold}
                onChange={(e) => setSettings((prev) => ({ ...prev, lowStockThreshold: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="receiptFooter">Receipt Footer Message</Label>
            <Textarea
              id="receiptFooter"
              value={settings.receiptFooter}
              onChange={(e) => setSettings((prev) => ({ ...prev, receiptFooter: e.target.value }))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Current Currency Display */}
      <Card>
        <CardHeader>
          <CardTitle>Current Currency</CardTitle>
          <CardDescription>Active currency settings for the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <div>
              <div className="text-lg font-semibold text-blue-900">
                {currentCurrency.code} ({currentCurrency.symbol})
              </div>
              <div className="text-sm text-blue-700">{currentCurrency.name}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-900">
                {currentCurrency.symbol}1,234.56
              </div>
              <div className="text-xs text-blue-600">Example format</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Settings</CardTitle>
          <CardDescription>Configure inventory management preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto Reorder</Label>
              <p className="text-sm text-gray-500">Automatically reorder items when stock is low</p>
            </div>
            <Switch
              checked={settings.autoReorderEnabled}
              onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, autoReorderEnabled: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>
            Low stock, expiry, and prescription reminders appear in the dashboard notification bell. Email and SMS
            delivery are not configured in this release.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data protection</CardTitle>
          <CardDescription>
            Database backups are managed by your hosting provider (e.g. Supabase). Export reports from Reports or
            Accounting modules for local archives.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Save Settings */}
      <div className="flex justify-end">
        <Button onClick={handleSave} className="min-w-32">
          <Save className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </div>
    </div>
  )
}
