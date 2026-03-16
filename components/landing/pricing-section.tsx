"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"
import Link from "next/link"
import { PricingToggle } from "./pricing-toggle"
import { cn } from "@/lib/utils"

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    description: "For single-location pharmacies getting started.",
    monthlyPrice: 49,
    annualPrice: 39,
    features: [
      "Up to 500 products",
      "Inventory & stock alerts",
      "Basic sales & POS",
      "Customer records",
      "Email support",
    ],
    cta: "Get started",
    href: "/onboarding",
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For growing pharmacies that need compliance and reporting.",
    monthlyPrice: 129,
    annualPrice: 107,
    features: [
      "Unlimited products",
      "Prescription management",
      "Compliance reports (DEA, state)",
      "Multi-user access",
      "Low-stock & expiry alerts",
      "Priority support",
    ],
    cta: "Start free trial",
    href: "/onboarding",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For chains and organizations with custom needs.",
    monthlyPrice: null,
    annualPrice: null,
    features: [
      "Everything in Pro",
      "Multi-branch management",
      "Dedicated success manager",
      "Custom integrations",
      "SLA & onboarding",
      "Phone & email support",
    ],
    cta: "Contact sales",
    href: "/onboarding",
    popular: false,
  },
] as const

export function PricingSection() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual")

  return (
    <section
      id="pricing"
      className="scroll-mt-20 border-t border-slate-200/80 bg-slate-50/50 py-20 md:py-24"
      aria-labelledby="pricing-heading"
    >
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="pricing-heading" className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-lg text-slate-600">
            Choose the plan that fits your pharmacy. Scale or change anytime.
          </p>
          <div className="mt-8 flex justify-center">
            <PricingToggle value={billing} onValueChange={setBilling} />
          </div>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={cn(
                "relative flex flex-col border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-2",
                plan.popular && "border-teal-500/50 ring-1 ring-teal-500/20 lg:scale-[1.02]"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
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
                        ${billing === "annual" ? plan.annualPrice : plan.monthlyPrice}
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
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
