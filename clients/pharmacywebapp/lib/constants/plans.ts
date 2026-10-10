/**
 * Subscription plans — single source of truth for the pricing section and the
 * onboarding wizard, so the two can never offer different plans.
 */

export const PLANS = [
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
      "IRD reports & VAT summary",
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

export type PlanId = (typeof PLANS)[number]["id"]

export const PLAN_IDS = PLANS.map((p) => p.id) as readonly PlanId[]

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value)
}
