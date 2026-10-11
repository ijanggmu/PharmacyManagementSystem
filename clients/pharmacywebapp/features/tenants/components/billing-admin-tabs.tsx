"use client"

import { Layers, Receipt, Wallet } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BillingPlans } from "@/features/tenants/components/billing-plans"
import { BillingInvoices } from "@/features/tenants/components/billing-invoices"
import { BillingTopups } from "@/features/tenants/components/billing-topups"
import { useTabParam } from "@/features/tenants/hooks/use-tab-param"

const TABS = ["plans", "invoices", "topups"] as const

/** Three admin surfaces for the Billing module, grouped under one page so the superadmin area
 * doesn't need a separate nav entry per surface. The open tab lives in `?tab=`. */
export function BillingAdminTabs() {
  const [tab, setTab] = useTabParam(TABS)
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="max-w-full overflow-x-auto">
        <TabsTrigger value="plans">
          <Layers aria-hidden />
          Plans
        </TabsTrigger>
        <TabsTrigger value="invoices">
          <Receipt aria-hidden />
          Invoices
        </TabsTrigger>
        <TabsTrigger value="topups">
          <Wallet aria-hidden />
          Wallet top-ups
        </TabsTrigger>
      </TabsList>
      <TabsContent value="plans" className="mt-4">
        <BillingPlans />
      </TabsContent>
      <TabsContent value="invoices" className="mt-4">
        <BillingInvoices />
      </TabsContent>
      <TabsContent value="topups" className="mt-4">
        <BillingTopups />
      </TabsContent>
    </Tabs>
  )
}
