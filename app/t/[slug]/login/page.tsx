import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function TenantLoginPage({ params }: PageProps) {
  const { slug } = await params
  const pharmacyCode = decodeURIComponent(slug).trim().toLowerCase()

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data?.user) {
    redirect("/dashboard")
  }

  redirect(`/?auth=signin&code=${encodeURIComponent(pharmacyCode)}`)
}

