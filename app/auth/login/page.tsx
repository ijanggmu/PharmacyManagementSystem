import LoginForm from "@/components/login-form"

export default async function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafb] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <LoginForm />
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
