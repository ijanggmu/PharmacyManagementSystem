import { dotnetClient } from "@/lib/api/dotnet-client"
import { splitCustomerName } from "@/lib/api/customers-api"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import {
  prescriptionRefillsDotnet,
  type DotnetPrescriptionRefillDto,
} from "@/lib/api/prescriptions-api"

export interface PrescriptionRefill {
  id: string
  prescription_id: string
  medicine_id: string
  quantity_dispensed: number
  refill_date: string
  next_refill_date: string | null
  status: "pending" | "filled" | "cancelled"
  created_at: string
  dispensed_by: string | null
  notes: string | null
}

export interface DueRefillRow extends PrescriptionRefill {
  refill_number: number
  prescriptions: {
    id: string
    prescription_number?: string
    customers?: {
      id: string
      first_name?: string
      last_name?: string
      phone?: string
      email?: string
    } | null
  } | null
}

/** RefillDueDto from the Prescriptions module (GET /prescriptions/reports/refills-due). */
interface DotnetRefillDueDto {
  prescriptionId: string
  customerId: string
  customerName: string | null
  medicineId: string
  medicineName: string | null
  refillsAllowed: number
  refillsUsed: number
  refillsRemaining: number
  expiryDate: string
}

/**
 * Maps a refill-due row to the legacy shape. The .NET report has no refill schedule, so next_refill_date is null
 * and refill_date is empty. The prescription number is derived from the id like the prescription list does.
 */
function toDueRefillRow(dto: DotnetRefillDueDto): DueRefillRow {
  const customer = dto.customerName ? splitCustomerName(dto.customerName) : null
  return {
    id: `${dto.prescriptionId}:${dto.medicineId}`,
    prescription_id: dto.prescriptionId,
    medicine_id: dto.medicineId,
    refill_number: dto.refillsUsed,
    quantity_dispensed: 0,
    refill_date: "",
    next_refill_date: null,
    status: "pending",
    created_at: "",
    dispensed_by: null,
    notes: null,
    prescriptions: {
      id: dto.prescriptionId,
      prescription_number: `RX-${dto.prescriptionId.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      customers: customer
        ? { id: dto.customerId, first_name: customer.first, last_name: customer.last }
        : null,
    },
  }
}

/** Maps a PrescriptionRefillDto (GET/POST /prescriptions/{..}/refills) to the legacy row shape. */
function toRefill(dto: DotnetPrescriptionRefillDto): PrescriptionRefill {
  return {
    id: dto.id,
    prescription_id: dto.prescriptionId,
    medicine_id: dto.medicineId,
    quantity_dispensed: dto.quantityDispensed,
    refill_date: dto.refilledAtUtc,
    next_refill_date: null,
    status: "filled",
    created_at: dto.refilledAtUtc,
    dispensed_by: dto.dispensedByUserId,
    notes: dto.notes,
  }
}

export const prescriptionRefillsApi = {
  /** Lists refills recorded against one prescription (GET /prescriptions/refills?prescriptionId=...). */
  getRefills: async (prescriptionId: string) => {
    try {
      const page = await prescriptionRefillsDotnet.list({ prescriptionId, limit: 200 })
      return { data: page.items.map(toRefill), error: null as string | null }
    } catch (error) {
      return {
        data: [] as PrescriptionRefill[],
        error: stockErrorMessage(error, "Failed to load prescription refills") as string | null,
      }
    }
  },

  /** Records a refill against a prescription item (POST /prescriptions/{prescriptionId}/refills). Runs
   * through the same dispensing safety checks the .NET API applies to a sale-driven dispense. */
  createRefill: async (refillData: {
    prescription_id: string
    medicine_id: string
    quantity_dispensed: number
    notes?: string
  }) => {
    try {
      const dto = await prescriptionRefillsDotnet.create(refillData.prescription_id, {
        medicineId: refillData.medicine_id,
        quantityDispensed: refillData.quantity_dispensed,
        notes: refillData.notes,
      })
      return { data: toRefill(dto), error: null as string | null }
    } catch (error) {
      return {
        data: null as PrescriptionRefill | null,
        error: stockErrorMessage(error, "Failed to record prescription refill") as string | null,
      }
    }
  },

  getDueRefills: async (daysAhead: number = 7) => {
    try {
      const rows = await dotnetClient.get<DotnetRefillDueDto[]>(
        `/prescriptions/reports/refills-due?withinDays=${encodeURIComponent(String(daysAhead))}`
      )
      return { data: rows.map(toDueRefillRow), error: null as string | null }
    } catch (error) {
      return {
        data: [] as DueRefillRow[],
        error: stockErrorMessage(error, "Failed to load due prescription refills") as string | null,
      }
    }
  },
}
