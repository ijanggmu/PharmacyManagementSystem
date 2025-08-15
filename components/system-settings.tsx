"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Download, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function SystemSettings() {
  const { toast } = useToast()
  const [settings, setSettings] = useState({
    pharmacyName: "PharmaCare Pharmacy",
    pharmacyAddress: "123 Main Street, Healthcare City, HC 12345",
    pharmacyPhone: "+1-555-0123",
    pharmacyEmail: "info@pharmacare.com",
    taxRate: "8.00",
    currency: "USD",
    lowStockThreshold: "10",
    autoReorderEnabled: false,
    emailNotifications: true,
    smsNotifications: false,
    backupFrequency: "daily",
    receiptFooter: "Thank you for choosing PharmaCare!",
  })

  const handleSave = () => {
    // In a real app, you'd save these to a database or configuration service
    toast({
      title: "Settings Saved",
      description: "System settings have been updated successfully",
    })
  }

  const handleBackup = () => {
    toast({
      title: "Backup Started",
      description: "Database backup is being created...",
    })
  }

  const handleRestore = () => {
    toast({
      title: "Restore Started",
      description: "Database restore process initiated...",
    })
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
                value={settings.currency}
                onValueChange={(value) => setSettings((prev) => ({ ...prev, currency: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="CAD">CAD (C$)</SelectItem>
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

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Settings</CardTitle>
          <CardDescription>Configure how you receive system notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-gray-500">Receive notifications via email</p>
            </div>
            <Switch
              checked={settings.emailNotifications}
              onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, emailNotifications: checked }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>SMS Notifications</Label>
              <p className="text-sm text-gray-500">Receive notifications via SMS</p>
            </div>
            <Switch
              checked={settings.smsNotifications}
              onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, smsNotifications: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Backup & Restore */}
      <Card>
        <CardHeader>
          <CardTitle>Backup & Restore</CardTitle>
          <CardDescription>Manage your data backups and system restore</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Backup Frequency</Label>
            <Select
              value={settings.backupFrequency}
              onValueChange={(value) => setSettings((prev) => ({ ...prev, backupFrequency: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="manual">Manual Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleBackup} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Create Backup
            </Button>
            <Button onClick={handleRestore} variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Restore Backup
            </Button>
          </div>
        </CardContent>
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
