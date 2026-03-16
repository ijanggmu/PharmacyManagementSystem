import type React from "react"
import type { Metadata } from "next"
import { Inter, Plus_Jakarta_Sans } from "next/font/google"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"
import { CurrencyProvider } from "@/lib/contexts/currency-context"
import { QueryProvider } from "@/lib/query-client"
import { EnhancedErrorBoundary } from "@/components/error-handling/enhanced-error-boundary"
// Validate environment variables on startup
import "@/lib/utils/env-validation"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta",
})

export const metadata: Metadata = {
  title: "PharmaCare - Pharmacy Management System",
  description: "Professional pharmacy management system with inventory, sales, and prescription tracking",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakarta.variable} scroll-smooth`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="antialiased font-sans bg-slate-50 min-h-screen">
        <EnhancedErrorBoundary level="critical">
          <QueryProvider>
            <CurrencyProvider>
              {children}
              <Toaster />
            </CurrencyProvider>
          </QueryProvider>
        </EnhancedErrorBoundary>
      </body>
    </html>
  )
}
