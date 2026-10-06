"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import NewRefundForm from "./new-refund-form"
import { salesApi } from "@/features/sales/api-client"
import { usersApi } from "@/features/users/api-client"
import { backendTarget } from "@/lib/api/backend-target"

interface Sale {
  id: string
  sale_number: string
  total_amount: string
  tax_amount: string
  discount_amount: string
  payment_method: string
  sale_date: string
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string
    email: string
  } | null
  sale_items: {
    id: string
    medicine_id: string
    quantity: number
    unit_price: string
    total_price: string
    medicines: {
      id: string
      name: string
      generic_name: string
      strength: string
      form: string
    } | null
  }[]
}

interface CreateRefundModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedSaleId?: string
}

export default function CreateRefundModal({ isOpen, onClose, onSuccess, selectedSaleId }: CreateRefundModalProps) {
  const [sales, setSales] = useState<Sale[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  const loadData = async () => {
    setIsLoading(true)

    try {
      const dotnetAuth = backendTarget("AUTH") === "dotnet"
      const sessionRes = await fetch(dotnetAuth ? "/api/dotnet/auth/session" : "/api/auth/session", { cache: "no-store" })
      if (sessionRes.ok) {
        const sessionJson = await sessionRes.json()
        const userId = (dotnetAuth ? sessionJson?.user?.id : sessionJson?.data?.user?.id) as string | undefined
        const { data: userData } = userId ? await usersApi.getUser(userId) : { data: null }
        setCurrentUser(userData)
      }

      const { data: salesData, error: salesError } = await salesApi.getSales({
        limit: 100,
        sortBy: "sale_date",
        sortOrder: "desc",
      })
      if (salesError) throw new Error(salesError)
      setSales((salesData || []) as Sale[])
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuccess = () => {
    onSuccess()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>Create New Refund</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <NewRefundForm
              sales={sales}
              currentUser={currentUser}
              onSuccess={handleSuccess}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

