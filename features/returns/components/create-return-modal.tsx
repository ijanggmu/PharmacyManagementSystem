"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
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
      const sessionRes = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (sessionRes.ok) {
        const sessionJson = await sessionRes.json()
        const userId = sessionJson?.user?.id as string | undefined
        const { data: userData } = userId ? await usersApi.getUser(userId) : { data: null }
        setCurrentUser(userData)
      }

      const [medicinesData, suppliersData] = await Promise.all([
        medicinesApi.getMedicines({ limit: 1000, sortBy: "name", sortOrder: "asc" }),
        suppliersApi.getAllSuppliers({ sortBy: "name", sortOrder: "asc" }),
      ])
      if (medicinesData.error) throw new Error(medicinesData.error)
      if (suppliersData.error) throw new Error(suppliersData.error)
      setMedicines(medicinesData.data || [])
      setSuppliers((suppliersData.data || []) as Supplier[])
    } catch (error) {
      toast({
        title: "Couldn't load the return form",
        description: (error instanceof Error && error.message) || "Medicines or suppliers failed to load. Close and try again.",
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
          <DialogTitle>New supplier return</DialogTitle>
          <DialogDescription>
            Send expired, damaged or recalled stock back to a supplier. Stock is reduced as soon as you post it.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4 py-2" role="status" aria-label="Loading form">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <div className="mt-2">
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

