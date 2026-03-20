import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function LoginPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data?.user) {
    redirect("/dashboard")
  }

  // Open the sign-in modal on the home page instead of a separate page.
  redirect("/?auth=signin")
}
