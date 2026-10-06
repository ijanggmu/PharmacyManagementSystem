import { redirect } from "next/navigation"
import { backendTarget } from "@/lib/api/backend-target"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

export default async function SignUpPage() {
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

  // Signup for existing pharmacies is not supported; onboarding creates the pharmacy workspace.
  redirect("/?auth=onboarding")
}
