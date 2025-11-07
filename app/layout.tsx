import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"
import { CurrencyProvider } from "@/lib/contexts/currency-context"
import { QueryProvider } from "@/lib/query-client"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
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
    <html lang="en" className={`${inter.variable} scroll-smooth`}>
      <body className="antialiased font-sans bg-slate-50 min-h-screen">
        <QueryProvider>
          <CurrencyProvider>
            {children}
            <Toaster />
          </CurrencyProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
