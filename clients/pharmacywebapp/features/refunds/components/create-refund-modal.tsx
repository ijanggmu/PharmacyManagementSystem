"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import type { User } from "@/features/users/api-client"
import { useToast } from "@/hooks/use-toast"
import NewRefundForm from "./new-refund-form"
import { salesApi } from "@/features/sales/api-client"
import { usersApi } from "@/features/users/api-client"

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
  const [currentUser, setCurrentUser] = useState<User | null>(null)
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
      const sessionRes = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (sessionRes.ok) {
        const sessionJson = await sessionRes.json()
        const userId = sessionJson?.user?.id as string | undefined
        const { data: userData } = userId ? await usersApi.getUser(userId) : { data: null }
        setCurrentUser(userData)
      }

      const { data: salesData, error: salesError } = await salesApi.getSales({
        limit: 100,
        // Refunds give money back, so only paid sales qualify.
        paymentStatuses: ["paid", "completed"],
        sortBy: "sale_date",
        sortOrder: "desc",
      })
      if (salesError) throw new Error(salesError)
      setSales((salesData || []) as Sale[])
    } catch (error) {
      toast({
        title: "Couldn't load the refund form",
        description: (error instanceof Error && error.message) || "Recent sales failed to load. Close and try again.",
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
          <DialogTitle>New refund</DialogTitle>
          <DialogDescription>
            Give a customer money back for items on a paid sale. New refunds start as pending until approved.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4 py-2" role="status" aria-label="Loading form">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <div className="mt-2">
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

