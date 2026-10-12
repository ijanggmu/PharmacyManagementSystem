"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { RotateCcw } from "lucide-react"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import ProcessReturnForm from "@/features/returns/components/process-return-form"
import { RETURNS_PATH } from "@/features/returns/lib/returns-view"
import { saleKeys, useSale } from "@/features/sales/hooks/use-sales"
import { returnKeys } from "@/features/returns/hooks/use-returns"
import { refundKeys } from "@/features/refunds/hooks/use-refunds"
import { canReturnSale } from "@/features/sales/lib/sale-detail"

/**
 * New customer return (/dashboard/returns/customer/new?saleId=…&item=…). Reached from "Process return" on a sale
 * in Sales history (list or details); `item` starts the form with that sale line selected.
 */
export function NewCustomerReturnView() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const saleId = searchParams.get("saleId") ?? ""
  const itemId = searchParams.get("item")

  const saleQuery = useSale(saleId)
  const sale = saleQuery.data?.data?.[0] ?? null
  const loadError = saleQuery.error ?? saleQuery.data?.error

  const back = () => (window.history.length > 1 ? router.back() : router.push("/dashboard/sales"))

  return (
    <PageContainer>
      <PageHeader
        title="New customer return"
        description={
          sale ? (
            <>
              Medicine coming back from sale <span className="num font-medium text-foreground">{sale.sale_number}</span>.
              Sealed packs go back into stock; the money is paid back on a credit note when you save.
            </>
          ) : (
            "Medicine coming back from a sale. Sealed packs go back into stock; the money is paid back on a credit note."
          )
        }
        icon={RotateCcw}
        backHref="/dashboard/sales"
        backLabel="Sales history"
      />
      <Section spacing="lg">
        {!saleId ? (
          <EmptyState
            icon={RotateCcw}
            title="Pick the sale first"
            description="Open the sale in Sales history and choose Process return, or Return on the medicine's line."
            action={{ label: "Go to sales history", href: "/dashboard/sales" }}
          />
        ) : saleQuery.isLoading ? (
          <div className="space-y-4" role="status" aria-label="Loading sale">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : loadError || !sale ? (
          <ErrorState
            title="We couldn't load this sale"
            message={`${typeof loadError === "string" ? loadError : loadError?.message || "The sale wasn't found."} Check your connection and try again.`}
            onRetry={() => void saleQuery.refetch()}
            retrying={saleQuery.isFetching}
          />
        ) : !canReturnSale(sale) ? (
          <EmptyState
            icon={RotateCcw}
            title="This sale can't take a return"
            description={
              sale.status === "cancelled"
                ? "The sale was cancelled, so its stock and money have already been reversed."
                : "Only a paid sale that hasn't been fully refunded can take a return."
            }
            action={{ label: "Back to sales history", href: "/dashboard/sales" }}
          />
        ) : (
          <ProcessReturnForm
            key={`${sale.id}:${itemId ?? ""}`}
            sale={sale}
            initialSaleItemId={itemId}
            onCancel={back}
            onSuccess={() => {
              for (const queryKey of [saleKeys.all, returnKeys.all, refundKeys.all]) {
                void queryClient.invalidateQueries({ queryKey })
              }
              router.push(RETURNS_PATH)
            }}
          />
        )}
      </Section>
    </PageContainer>
  )
}
