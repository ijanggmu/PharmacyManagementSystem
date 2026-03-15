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
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      {children}
    </>
  )
}
