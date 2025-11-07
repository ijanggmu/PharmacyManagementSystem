"use client"

import { Prescription } from "./types"

interface PrescriptionSelectorProps {
  prescriptions: Prescription[]
  selectedPrescription: Prescription | null
  onPrescriptionSelect: (prescription: Prescription | null) => void
}

export function PrescriptionSelector({
  prescriptions,
  selectedPrescription,
  onPrescriptionSelect,
}: PrescriptionSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Prescription</label>
      <select
        value={selectedPrescription?.id || ""}
        onChange={(e) => {
          const prescription = prescriptions.find(p => p.id === e.target.value) || null
          onPrescriptionSelect(prescription)
        }}
        className="w-full px-3 py-2 border rounded"
      >
        <option value="">No prescription</option>
        {prescriptions.map((prescription) => (
          <option key={prescription.id} value={prescription.id}>
            {prescription.prescription_number}
          </option>
        ))}
      </select>
    </div>
  )
}

