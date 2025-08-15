import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Pill, Shield, Users, BarChart3 } from "lucide-react"
import Link from "next/link"

export default async function HomePage() {
  // Check if user is already logged in
  const supabase = createClient()

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    // If user is logged in, redirect to dashboard
    if (session) {
      redirect("/dashboard")
    }
  } catch (error) {
    console.error("Error checking session:", error)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pill className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">PharmaCare</h1>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/sign-up">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Complete Pharmacy Management
            <span className="text-blue-600"> Made Simple</span>
          </h2>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            Streamline your pharmacy operations with our comprehensive management system. Handle inventory,
            prescriptions, sales, and customer data all in one place.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" asChild className="bg-blue-600 hover:bg-blue-700">
              <Link href="/auth/sign-up">Start Free Trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-gray-900 mb-4">Everything You Need</h3>
          <p className="text-lg text-gray-600">Powerful features designed for modern pharmacy management</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="text-center p-6 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Pill className="h-6 w-6 text-blue-600" />
            </div>
            <h4 className="text-xl font-semibold mb-2">Inventory Management</h4>
            <p className="text-gray-600">Track stock levels, expiry dates, and automate reordering</p>
          </Card>

          <Card className="text-center p-6 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Shield className="h-6 w-6 text-green-600" />
            </div>
            <h4 className="text-xl font-semibold mb-2">Prescription Management</h4>
            <p className="text-gray-600">Handle prescriptions safely with built-in verification</p>
          </Card>

          <Card className="text-center p-6 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <h4 className="text-xl font-semibold mb-2">Customer Management</h4>
            <p className="text-gray-600">Maintain detailed customer records and history</p>
          </Card>

          <Card className="text-center p-6 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="h-6 w-6 text-orange-600" />
            </div>
            <h4 className="text-xl font-semibold mb-2">Analytics & Reports</h4>
            <p className="text-gray-600">Comprehensive insights and business intelligence</p>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>&copy; 2024 PharmaCare. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
