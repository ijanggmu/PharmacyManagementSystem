import { Mail } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

/** Honest empty state: there is no persisted send history to show. */
export function EmailSmsTab() {
  return (
    <div className="rounded-lg border bg-card">
      <EmptyState
        size="compact"
        icon={Mail}
        title="Email / SMS history isn't recorded yet"
        description={
          "Email is sent fire-and-forget (SMTP / SendGrid) and only failures are written to the server log; " +
          "there is no SMS provider in this system. Nothing is missing from this page — there is simply no send " +
          "history table to read. Failed sends that raise an exception do appear under Errors."
        }
      />
    </div>
  )
}
