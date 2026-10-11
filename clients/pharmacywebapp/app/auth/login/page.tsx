import { redirect } from "next/navigation"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

export default async function LoginPage() {
  const authed = (await getDotnetSession()) !== null
  if (authed) {
    redirect("/dashboard")
  }

  // Open the sign-in modal on the home page instead of a separate page.
  redirect("/?auth=signin")
}
