import LoginForm from "@/components/login-form"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function TenantLoginPage({ params }: PageProps) {
  const { slug } = await params
  const pharmacyCode = decodeURIComponent(slug).trim().toLowerCase()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafb] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <LoginForm initialPharmacyCode={pharmacyCode} />
      </div>
      <p className="mt-6 text-center text-sm text-[#64748b]">
        New pharmacy?{" "}
        <a href="/onboarding" className="font-medium text-[#0d9488] hover:underline">
          Get started
        </a>
      </p>
    </div>
  )
}
