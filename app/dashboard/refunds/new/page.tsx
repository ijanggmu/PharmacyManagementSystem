import { createClient } from "@/lib/supabase/server"
import NewRefundForm from "@/components/new-refund-form"

async function getSales() {
  const supabase = createClient()

  const { data: sales, error } = await supabase
    .from("sales")
    .select(`
      *,
      customers (
        id,
        first_name,
        last_name,
        phone,
        email
      ),
      sale_items (
        id,
        medicine_id,
        quantity,
        unit_price,
        total_price,
        medicines (
          id,
          name,
          generic_name,
          strength,
          form
        )
      )
    `)
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("Error fetching sales:", error)
    return []
  }

  return sales || []
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

export default async function NewRefundPage() {
  const [sales, currentUser] = await Promise.all([getSales(), getCurrentUser()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Process New Refund</h1>
        <p className="text-gray-600">Create a refund for a customer return</p>
      </div>

      <NewRefundForm sales={sales} currentUser={currentUser} />
    </div>
  )
}
