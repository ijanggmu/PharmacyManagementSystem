import { redirect } from "next/navigation"

export default function AccountingIndexPage() {
  redirect("/dashboard/reports/accounting/ledger")
}
