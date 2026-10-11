"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Home, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-6xl font-bold text-foreground mb-4">404</CardTitle>
          <CardTitle className="text-2xl font-semibold text-foreground">Page Not Found</CardTitle>
          <CardDescription>
            The page you're looking for doesn't exist in our pharmacy management system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">What you can do:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Check the URL for any typos</li>
              <li>• Use the navigation menu to find what you need</li>
              <li>• Go back to the dashboard and start over</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Popular Pages:</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link href="/dashboard" className="text-primary hover:underline">
                Dashboard
              </Link>
              <Link href="/dashboard/sales/new" className="text-primary hover:underline">
                Point of Sale
              </Link>
              <Link href="/dashboard/inventory" className="text-primary hover:underline">
                Inventory
              </Link>
              <Link href="/dashboard/sales" className="text-primary hover:underline">
                Sales
              </Link>
              <Link href="/dashboard/customers" className="text-primary hover:underline">
                Customers
              </Link>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={() => window.history.back()} variant="outline" className="flex-1">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
            <Button asChild className="flex-1">
              <Link href="/dashboard">
                <Home className="h-4 w-4 mr-2" />
                Go to Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
