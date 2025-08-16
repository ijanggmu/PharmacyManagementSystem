import { createClient } from "@/lib/supabase/server"
import NewReturnForm from "@/components/new-return-form"

async function getMedicines() {
  const supabase = createClient()

  const { data: medicines, error } = await supabase
    .from("medicines")
    .select(`
      *,
      categories (
        id,
        name
      ),
      suppliers (
        id,
        name,
        contact_person,
        phone,
        email
      )
    `)
    .order("name")

  if (error) {
    console.error("Error fetching medicines:", error)
    return []
  }

  return medicines || []
}

async function getSuppliers() {
  const supabase = createClient()

  const { data: suppliers, error } = await supabase.from("suppliers").select("*").order("name")

  if (error) {
    console.error("Error fetching suppliers:", error)
    return []
  }

  return suppliers || []
}

async function getCurrentUser() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: userData } = await supabase.from("users").select("*").eq("email", user.email).single()

  return userData
}

export default async function NewReturnPage() {
  const [medicines, suppliers, currentUser] = await Promise.all([getMedicines(), getSuppliers(), getCurrentUser()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Medicine Return</h1>
        <p className="text-gray-600">Process a return to supplier for expired or defective medicines</p>
      </div>

      <NewReturnForm medicines={medicines} suppliers={suppliers} currentUser={currentUser} />
    </div>
  )
}
