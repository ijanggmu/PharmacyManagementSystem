"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import NewReturnForm from "./new-return-form"

interface Medicine {
  id: string
  name: string
  generic_name: string
  strength: string
  form: string
  batch_number: string
  expiry_date: string
  stock_quantity: number
  unit_price: number
  suppliers: {
    id: string
    name: string
    contact_person: string
    phone: string
    email: string
  } | null
}

interface Supplier {
  id: string
  name: string
  contact_person: string
  phone: string
  email: string
}

interface User {
  id: string
  full_name: string
  email: string
}

interface CreateReturnModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedSupplierId?: string
}

export default function CreateReturnModal({ isOpen, onClose, onSuccess, selectedSupplierId }: CreateReturnModalProps) {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
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

      // Get medicines with suppliers
      const { data: medicinesData, error: medicinesError } = await supabase
        .from("medicines")
        .select(`
          *,
          suppliers (*)
        `)
        .order("name")

      if (medicinesError) throw medicinesError
      setMedicines(medicinesData || [])

      // Get suppliers
      const { data: suppliersData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("*")
        .order("name")

      if (suppliersError) throw suppliersError
      setSuppliers(suppliersData || [])
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Return</DialogTitle>
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
            <NewReturnForm
              medicines={medicines}
              suppliers={suppliers}
              currentUser={currentUser}
              onSuccess={handleSuccess}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

