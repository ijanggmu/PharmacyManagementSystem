"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { User, Phone, Mail, MapPin, Calendar, ShoppingCart, FileText } from "lucide-react"
import { Customer } from "@/features/customers/api-client"
import { CurrencyDisplay } from "@/components/currency-display"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import { salesApi } from "@/features/sales/api-client"

interface CustomerDetailModalProps {
  customer: Customer | null
  isOpen: boolean
  onClose: () => void
}

export default function CustomerDetailModal({ customer, isOpen, onClose }: CustomerDetailModalProps) {
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (customer && isOpen) {
      loadCustomerData()
    }
  }, [customer, isOpen])

  const loadCustomerData = async () => {
    if (!customer) return

    setIsLoading(true)
    try {
      const [prescriptionsResult, salesResult] = await Promise.all([
        prescriptionsApi.getPrescriptions({ customerId: customer.id, limit: 100 }),
        salesApi.getSales({ customerId: customer.id, limit: 100 }),
      ])

      if (!prescriptionsResult.error) setPrescriptions(prescriptionsResult.data || [])
      if (!salesResult.error) setSales(salesResult.data || [])
    } catch (error) {
      console.error("Error loading customer data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!customer) return null

  const totalSpent = sales.reduce((sum, sale) => sum + Number.parseFloat(sale.total_amount), 0)
  const age = customer.date_of_birth
    ? Math.floor((new Date().getTime() - new Date(customer.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {customer.first_name} {customer.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Contact Information</h3>
              <div className="space-y-2">
                {customer.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-gray-400" />
                    {customer.email}
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    {customer.phone}
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {customer.address}
                  </div>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Personal Information</h3>
              <div className="space-y-2">
                {customer.date_of_birth && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    {new Date(customer.date_of_birth).toLocaleDateString()}
                    {age && <span className="text-gray-500">({age} years old)</span>}
                  </div>
                )}
                <div className="text-sm">
                  <span className="font-medium">Customer since:</span>{" "}
                  {new Date(customer.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Statistics */}
          <div>
            <h3 className="font-semibold mb-2">Customer Statistics</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{prescriptions.length}</div>
              <div className="text-sm text-gray-600">Prescriptions</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{sales.length}</div>
              <div className="text-sm text-gray-600">Purchases</div>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                <CurrencyDisplay amount={totalSpent.toFixed(2)} />
              </div>
              <div className="text-sm text-gray-600">Total Spent</div>
            </div>
          </div>
          </div>

          <Separator />

          {/* Recent Prescriptions */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Recent Prescriptions
            </h3>
            {prescriptions.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {prescriptions.slice(0, 5).map((prescription) => (
                  <div key={prescription.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{prescription.prescription_number}</div>
                        <div className="text-sm text-gray-600">Dr. {prescription.doctor_name}</div>
                        <div className="text-sm text-gray-500">
                          {prescription.prescription_items?.length || 0} items
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={prescription.status === "filled" ? "default" : "secondary"}>
                          {prescription.status}
                        </Badge>
                        <div className="text-sm text-gray-500 mt-1">
                          {new Date(prescription.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No prescriptions found</p>
            )}
          </div>

          <Separator />

          {/* Recent Purchases */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Recent Purchases
            </h3>
            {sales.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {sales.slice(0, 5).map((sale) => (
                  <div key={sale.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">Sale #{sale.id.slice(0, 8)}</div>
                        <div className="text-sm text-gray-600">Payment: {sale.payment_method}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-green-600">
                          <CurrencyDisplay amount={Number.parseFloat(sale.total_amount).toFixed(2)} />
                        </div>
                        <div className="text-sm text-gray-500">{new Date(sale.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No purchases found</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
