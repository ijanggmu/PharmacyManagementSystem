import LoginForm from "@/components/login-form"

export default async function LoginPage() {
  // The middleware handles authentication redirects
  // No need to check session here as middleware will redirect authenticated users

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12 sm:px-6 lg:px-8">
      <LoginForm />
    </div>
  )
}
