import type React from "react"
import { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"
import { CurrencyProvider } from "@/lib/contexts/currency-context"
import { QueryProvider } from "@/lib/query-client"
import { EnhancedErrorBoundary } from "@/components/error-handling/enhanced-error-boundary"
import { AuthDialogProvider } from "@/lib/contexts/auth-dialog-context"
import AuthDialog from "@/components/auth-dialog/auth-dialog"
import { RegionCurrencyInitializer } from "@/components/region-currency-initializer"
import { ReportIssueTrigger } from "@/components/report-issue-trigger"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { THEME_INIT_SCRIPT } from "@/components/theme/theme-script"
import { RouteProgress } from "@/components/brand/route-progress"
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
  title: {
    default: "PharmaCare — Pharmacy management, done right",
    template: "%s · PharmaCare",
  },
  description:
    "Inventory, prescriptions, point of sale, accounting and IRD-ready compliance reporting for pharmacies — in one secure workspace.",
  applicationName: "PharmaCare",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#141518" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakarta.variable} scroll-smooth`} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint — no light flash for dark-mode users. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        <ThemeProvider>
          <EnhancedErrorBoundary level="critical">
            <QueryProvider>
              <CurrencyProvider>
                <AuthDialogProvider>
                  {children}
                  <AuthDialog />
                  <RegionCurrencyInitializer />
                  <ReportIssueTrigger />
                </AuthDialogProvider>
              </CurrencyProvider>
            </QueryProvider>
          </EnhancedErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  )
}
