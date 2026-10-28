"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogScrollBody,
  DialogTitle,
  DialogTrigger,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import AddPrescriptionForm from "@/features/prescriptions/components/add-prescription-form"

interface DashboardPrescriptionModalProps {
  children: React.ReactNode
}

export default function DashboardPrescriptionModal({ children }: DashboardPrescriptionModalProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>New prescription</DialogTitle>
        </DialogHeader>
        <DialogScrollBody className="pb-6 pt-4">
          <AddPrescriptionForm onSuccess={() => setIsOpen(false)} />
        </DialogScrollBody>
      </DialogContent>
    </Dialog>
  )
}

