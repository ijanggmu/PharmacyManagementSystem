import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function SignUpPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data?.user) {
    redirect("/dashboard")
  }

  // Signup for existing pharmacies is not supported; onboarding creates the pharmacy workspace.
  redirect("/?auth=onboarding")
}
