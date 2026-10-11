// Re-export medicines as inventory for inventory management
export { useMedicines as useInventory } from "./use-medicines"
export { useMedicine, useCreateMedicine, useUpdateMedicine, useDeleteMedicine } from "./use-medicines"
export type { MedicinesFilters } from "@/features/medicines/api-client"
