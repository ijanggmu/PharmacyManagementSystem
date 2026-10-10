import type { Metadata } from "next"
import { DashboardShell } from "@/components/dashboard-layout"

export const metadata: Metadata = {
  title: {
    template: "%s · PharmaCare",
    default: "Dashboard · PharmaCare",
  },
  description: "Pharmacy management dashboard — sales, inventory, prescriptions, and reports",
  robots: "noindex", // Dashboard is behind auth; adjust if you use public dashboard
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Mounted once for every /dashboard route: navigation swaps only the page, never the shell.
  return <DashboardShell>{children}</DashboardShell>
}
