import { redirect } from "next/navigation"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

export default async function SignUpPage() {
  const authed = (await getDotnetSession()) !== null
  if (authed) {
    redirect("/dashboard")
  }

  // Signup for existing pharmacies is not supported; onboarding creates the pharmacy workspace.
  redirect("/?auth=onboarding")
}
