import { redirect } from "next/navigation"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

export default async function OnboardingPage() {
  const authed = (await getDotnetSession()) !== null
  if (authed) {
    redirect("/dashboard")
  }

  // Open the onboarding modal on the home page instead of navigating to a separate page.
  redirect("/?auth=onboarding")
}
