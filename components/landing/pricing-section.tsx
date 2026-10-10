"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"
import { PricingToggle } from "./pricing-toggle"
import { cn } from "@/lib/utils"
import { CurrencyDisplay } from "@/components/currency-display"
import { useAuthDialog } from "@/lib/contexts/auth-dialog-context"
import Link from "next/link"
import { useCurrency } from "@/lib/contexts/currency-context"
import { convertFromUSD } from "@/lib/currency/convert"
import { PLANS } from "@/lib/constants/plans"


export function PricingSection({ authenticated = false }: { authenticated?: boolean }) {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual")
  const { openGetStarted } = useAuthDialog()
  const { currentCurrency } = useCurrency()

  return (
    <section
      id="pricing"
      className="scroll-mt-20 border-t border-slate-200/70 bg-slate-50/60 py-20 md:py-28"
      aria-labelledby="pricing-heading"
    >
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Pricing</p>
          <h2 id="pricing-heading" className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Choose the plan that fits your pharmacy. Scale or change anytime.
          </p>
          <div className="mt-8 flex justify-center">
            <PricingToggle value={billing} onValueChange={setBilling} />
          </div>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3 lg:items-start">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={cn(
                "relative flex flex-col border-slate-200/80 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-1 focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-2",
                plan.popular
                  ? "border-transparent bg-gradient-to-b from-teal-600 to-teal-700 shadow-[0_24px_60px_-20px_rgba(13,148,136,0.45)] lg:scale-[1.04]"
                  : "hover:border-slate-300 hover:shadow-[0_16px_40px_-20px_rgba(15,23,42,0.2)]"
              )}
            >
              <div className={cn("flex h-full flex-col rounded-[calc(var(--radius)-2px)]", plan.popular && "bg-white")}>
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="border-0 bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-md">
                    Most popular
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="font-display text-xl font-semibold text-slate-900">
                  {plan.name}
                </CardTitle>
                <CardDescription className="text-slate-600">{plan.description}</CardDescription>
                <div className="pt-4">
                  {plan.monthlyPrice != null ? (
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-bold tracking-tight text-slate-900">
                        <CurrencyDisplay
                          amount={convertFromUSD(
                            billing === "annual" ? (plan.annualPrice ?? 0) : plan.monthlyPrice,
                            currentCurrency.code,
                          )}
                        />
                      </span>
                      <span className="text-slate-500">/month</span>
                    </div>
                  ) : (
                    <div className="font-display text-3xl font-bold tracking-tight text-slate-900">
                      Custom
                    </div>
                  )}
                  {plan.monthlyPrice != null && billing === "annual" && (
                    <p className="mt-1 text-sm text-slate-500">Billed annually</p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <ul className="space-y-3" role="list">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-slate-700">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-600">
                        <Check className="h-3 w-3" aria-hidden />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="pt-6">
                <Button
                  asChild
                  className={cn(
                    "w-full font-semibold focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2",
                    plan.popular
                      ? "bg-teal-600 text-white shadow-md hover:bg-teal-700"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  )}
                  size="lg"
                >
                  {authenticated ? (
                    <Link href="/dashboard">Dashboard</Link>
                  ) : (
                    <button type="button" onClick={() => openGetStarted(plan.id)}>
                      {plan.cta}
                    </button>
                  )}
                </Button>
              </CardFooter>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
