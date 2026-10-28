"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import NewReturnForm from "./new-return-form"
import { useCurrentUserProfile } from "@/features/returns/hooks/use-current-user-profile"

interface CreateReturnModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called when the user closes the success screen (the debit note is already posted). */
  onSuccess: () => void
  selectedSupplierId?: string
}

export default function CreateReturnModal({ isOpen, onClose, onSuccess, selectedSupplierId }: CreateReturnModalProps) {
  const currentUser = useCurrentUserProfile(isOpen)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>New supplier return</DialogTitle>
          <DialogDescription>
            Posts a numbered debit note: stock goes down and the supplier&apos;s payable drops by cost plus VAT.
          </DialogDescription>
        </DialogHeader>
        {isOpen && (
          <DialogScrollBody className="pb-6 pt-4">
            <NewReturnForm
              key={selectedSupplierId ?? "new"}
              currentUser={currentUser}
              initialSupplierId={selectedSupplierId}
              onSuccess={() => {
                onSuccess()
                onClose()
              }}
            />
          </DialogScrollBody>
        )}
      </DialogContent>
    </Dialog>
  )
}
