"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import AddPrescriptionForm from "@/features/prescriptions/components/add-prescription-form"

interface DashboardPrescriptionModalProps {
  children: React.ReactNode
}

export default function DashboardPrescriptionModal({ children }: DashboardPrescriptionModalProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>New prescription</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          <AddPrescriptionForm onSuccess={() => setIsOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

