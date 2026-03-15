"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import NewRefundForm from "./new-refund-form"

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
    const supabase = createClient()

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: userData } = await supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single()
        setCurrentUser(userData)
      }

      // Get sales
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select(`
          *,
          customers (*),
          sale_items (
            *,
            medicines (id, name, generic_name, strength, form)
          )
        `)
        .order("sale_date", { ascending: false })
        .limit(100)

      if (salesError) throw salesError
      setSales(salesData || [])
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

