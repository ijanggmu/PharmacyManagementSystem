import type { ReactNode } from "react"

// Re-mounts whenever the top-level module changes (sales → inventory), giving each new
// module a short fade-up. Sub-pages inside a module (e.g. accounting tabs) don't re-trigger it.
export default function DashboardTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-page-in motion-reduce:animate-none">{children}</div>
}
