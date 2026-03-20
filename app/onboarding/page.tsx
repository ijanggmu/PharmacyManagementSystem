import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data?.user) {
    redirect("/dashboard")
  }

  // Open the onboarding modal on the home page instead of navigating to a separate page.
  redirect("/?auth=onboarding")
}

