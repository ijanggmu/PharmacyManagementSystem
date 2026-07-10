"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Medicine } from "@/features/medicines/api-client"
import NewReturnForm from "./new-return-form"
import { medicinesApi } from "@/features/medicines/api-client"
import { suppliersApi } from "@/features/suppliers/api-client"
import { usersApi } from "@/features/users/api-client"

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

    try {
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" })
      if (sessionRes.ok) {
        const sessionJson = await sessionRes.json()
        const userId = sessionJson?.data?.user?.id as string | undefined
        const { data: userData } = userId ? await usersApi.getUser(userId) : { data: null }
        setCurrentUser(userData)
      }

      const [medicinesData, suppliersData] = await Promise.all([
        medicinesApi.getMedicines({ limit: 1000, sortBy: "name", sortOrder: "asc" }),
        suppliersApi.getSuppliers({ limit: 1000, sortBy: "name", sortOrder: "asc" } as any),
      ])
      if (medicinesData.error) throw new Error(medicinesData.error)
      if (suppliersData.error) throw new Error(suppliersData.error)
      setMedicines(medicinesData.data || [])
      setSuppliers((suppliersData.data || []) as Supplier[])
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

