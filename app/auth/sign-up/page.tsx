import { redirect } from "next/navigation"

export default async function SignUpPage() {
  // Signup for existing pharmacies is not supported; onboarding creates the pharmacy workspace.
  redirect("/onboarding")
}
