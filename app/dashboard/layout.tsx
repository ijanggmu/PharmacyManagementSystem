import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {
    template: "%s | PharmaCare",
    default: "Dashboard | PharmaCare",
  },
  description: "Pharmacy management dashboard — sales, inventory, prescriptions, and reports",
  robots: "noindex", // Dashboard is behind auth; adjust if you use public dashboard
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
