import { ApiListResponse, BaseFilters, listApiWrapper } from "@/lib/api/utils"
import {
  getPrescriptionStatsOnDotnet,
  prescriptionsDotnet,
  type DotnetCreatePrescriptionBody,
  type DotnetPrescriptionDto,
  type DotnetPrescriptionItemDto,
  type DotnetUpdatePrescriptionBody,
} from "@/lib/api/prescriptions-api"
import { splitCustomerName } from "@/lib/api/customers-api"

export interface PrescriptionItem {
  id: string
  prescription_id: string
  medicine_id: string
  quantity_prescribed: number
  quantity_dispensed: number
  dosage_instructions: string
  medicines: {
    id: string
    name: string
    strength: string
    form: string
  } | null
}

export interface Prescription {
  id: string
  prescription_number: string
  customer_id: string
  doctor_name: string
  /** Prescriber's NMC registration number; required with a controlled medicine. */
  doctor_license: string | null
  prescribed_date: string
  expiry_date: string | null
  status: "pending" | "filled" | "partially_filled" | "cancelled"
  notes: string | null
  created_at: string
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string | null
  } | null
  prescription_items: PrescriptionItem[]
}

export interface PrescriptionsFilters extends BaseFilters {
  status?: Prescription["status"]
  statuses?: Prescription["status"][]
  customerId?: string
  doctorName?: string
  dateFrom?: string
  dateTo?: string
}

export interface CreatePrescriptionData {
  prescription_number: string
  customer_id: string
  doctor_name: string
  doctor_license?: string | null
  prescribed_date: string
  expiry_date?: string | null
  status: Prescription["status"]
  notes?: string
  prescription_items: Omit<PrescriptionItem, "id" | "prescription_id" | "medicines">[]
}

export interface UpdatePrescriptionData {
  doctor_name?: string
  /** An empty string clears it (refused for a prescription with a controlled medicine). */
  doctor_license?: string
  status?: Prescription["status"]
  notes?: string
  /** Optional per-item dosage directions; omitted leaves every item unchanged. */
  prescription_items?: { id: string; dosage_instructions: string | null }[]
}

/**
 * Fill state, derived the same way the .NET stats handler does: cancelled wins; no items or nothing
 * dispensed is pending; every item fully dispensed is filled; anything in between is partially filled.
 */
export function deriveLegacyStatus(dto: DotnetPrescriptionDto): Prescription["status"] {
  if (dto.status === "Cancelled") return "cancelled"
  const items = dto.items
  if (items.every((i) => i.dispensedQuantity === 0)) return "pending"
  if (items.every((i) => i.dispensedQuantity >= i.prescribedQuantity)) return "filled"
  return "partially_filled"
}

function toLegacyItem(prescriptionId: string, item: DotnetPrescriptionItemDto): PrescriptionItem {
  return {
    id: item.id,
    prescription_id: prescriptionId,
    medicine_id: item.medicineId,
    quantity_prescribed: item.prescribedQuantity,
    quantity_dispensed: item.dispensedQuantity,
    dosage_instructions: item.dosageInstructions ?? "",
    medicines: item.medicineName ? { id: item.medicineId, name: item.medicineName, strength: "", form: "" } : null,
  }
}

/** Maps a .NET PrescriptionDto to the legacy row the prescription pages render. */
export function toLegacyPrescription(dto: DotnetPrescriptionDto): Prescription {
  const customer = dto.customerName ? splitCustomerName(dto.customerName) : null
  return {
    id: dto.id,
    prescription_number: dto.prescriptionNumber ?? "",
    customer_id: dto.customerId,
    doctor_name: dto.doctorName,
    doctor_license: dto.doctorLicenseNumber ?? null,
    prescribed_date: dto.prescriptionDate,
    expiry_date: dto.expiryDate,
    status: deriveLegacyStatus(dto),
    notes: dto.notes,
    created_at: dto.createdAtUtc,
    customers: customer
      ? { id: dto.customerId, first_name: customer.first, last_name: customer.last, phone: null }
      : null,
    prescription_items: dto.items.map((item) => toLegacyItem(dto.id, item)),
  }
}

/** Maps the UI's create form to CreatePrescriptionCommand. Dropped field: prescription_number. */
export function toCreatePrescriptionBody(data: CreatePrescriptionData): DotnetCreatePrescriptionBody {
  if (!data.expiry_date) throw new Error("Expiry date is required")
  return {
    customerId: data.customer_id,
    doctorName: data.doctor_name,
    doctorLicenseNumber: data.doctor_license?.trim() || null,
    prescriptionDate: data.prescribed_date.slice(0, 10),
    expiryDate: data.expiry_date.slice(0, 10),
    notes: data.notes?.trim() || null,
    items: data.prescription_items.map((item) => ({
      medicineId: item.medicine_id,
      prescribedQuantity: item.quantity_prescribed,
      refillsAllowed: 0,
      dosageInstructions: item.dosage_instructions?.trim() || null,
    })),
  }
}

/** Legacy status filter values the .NET list accepts. Anything else is dropped. */
const LIST_STATUSES: readonly Prescription["status"][] = ["pending", "partially_filled", "filled", "cancelled"]

async function fetchPrescription(id: string): Promise<Prescription> {
  return toLegacyPrescription(await prescriptionsDotnet.get(id))
}

export const prescriptionsApi = {
  getPrescriptions: async (
    filters: PrescriptionsFilters = {}
  ): Promise<ApiListResponse<Prescription> & { total?: number }> => {
    try {
      const statuses = [
        ...(filters.status ? [filters.status] : []),
        ...(filters.statuses ?? []),
      ].filter((s): s is Prescription["status"] => LIST_STATUSES.includes(s))
      const page = await prescriptionsDotnet.list({
        page: filters.page,
        limit: filters.limit,
        customerId: filters.customerId,
        statuses: Array.from(new Set(statuses)),
        search: filters.search ?? filters.doctorName,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      })
      return {
        data: page.items.map(toLegacyPrescription),
        total: page.totalCount,
        error: null,
      }
    } catch (error) {
      return {
        data: [],
        total: 0,
        error: error instanceof Error ? error.message : "Failed to fetch prescriptions",
      }
    }
  },

  getPrescription: async (id: string): Promise<ApiListResponse<Prescription>> => {
    return listApiWrapper(async () => [await fetchPrescription(id)], "Failed to fetch prescription")
  },

  createPrescription: async (prescriptionData: CreatePrescriptionData): Promise<ApiListResponse<Prescription>> => {
    return listApiWrapper(async () => {
      const id = await prescriptionsDotnet.create(toCreatePrescriptionBody(prescriptionData))
      return [await fetchPrescription(id)]
    }, "Failed to create prescription")
  },

  /**
   * Supports doctor_name, notes (saved on the prescription; an empty string clears them) and cancellation
   * (status "cancelled", where notes is the cancel reason and is not saved as notes). Fill statuses are
   * derived from dispensing and cannot be set.
   */
  updatePrescription: async (
    id: string,
    updates: UpdatePrescriptionData
  ): Promise<ApiListResponse<Prescription>> => {
    return listApiWrapper(async () => {
      if (updates.status && updates.status !== "cancelled") {
        throw new Error("Prescription status is derived from dispensing and cannot be set directly")
      }
      const body: DotnetUpdatePrescriptionBody = {}
      if (updates.doctor_name !== undefined) {
        body.doctorName = updates.doctor_name
      }
      if (updates.doctor_license !== undefined) {
        body.doctorLicenseNumber = updates.doctor_license.trim()
      }
      if (updates.status !== "cancelled" && updates.notes !== undefined) {
        const notes = updates.notes.trim()
        if (notes) body.notes = notes
        else body.clearNotes = true
      }
      if (updates.prescription_items) {
        body.items = updates.prescription_items.map((item) => ({
          itemId: item.id,
          dosageInstructions: item.dosage_instructions?.trim() || null,
        }))
      }
      if (Object.keys(body).length > 0) {
        await prescriptionsDotnet.update(id, body)
      }
      if (updates.status === "cancelled") {
        await prescriptionsDotnet.cancel(id, updates.notes?.trim() || "Cancelled")
      }
      return [await fetchPrescription(id)]
    }, "Failed to update prescription")
  },

  updatePrescriptionStatus: async (
    id: string,
    status: Prescription["status"]
  ): Promise<ApiListResponse<Prescription>> => {
    return prescriptionsApi.updatePrescription(id, { status })
  },

  deletePrescription: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper(async () => {
      await prescriptionsDotnet.delete(id)
      return []
    }, "Failed to delete prescription")
  },

  getPrescriptionStats: async (): Promise<
    ApiListResponse<{
      total: number
      pending: number
      filled: number
      partially_filled: number
      cancelled: number
    }>
  > => {
    return listApiWrapper(async () => getPrescriptionStatsOnDotnet(), "Failed to fetch prescription statistics")
  },
}
