import { redirect } from "next/navigation"
import { backendTarget } from "@/lib/api/backend-target"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

export default async function OnboardingPage() {
  let authed = false
  if (backendTarget("AUTH") === "dotnet") {
    authed = (await getDotnetSession()) !== null
  } else {
    const { createClient } = await import("@/lib/supabase/server")
    const supabase = await createClient()
    authed = !!(await supabase.auth.getUser()).data?.user
  }
  if (authed) {
    redirect("/dashboard")
  }

  // Open the onboarding modal on the home page instead of navigating to a separate page.
  redirect("/?auth=onboarding")
}
