import AddSupplierForm from "@/components/add-supplier-form"
import DashboardLayout from "@/components/dashboard-layout"

export default function AddSupplierPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Add Supplier</h1>
          <p className="text-gray-600">Add a new supplier to your pharmacy network</p>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <AddSupplierForm />
        </div>
      </div>
    </DashboardLayout>
  )
}
