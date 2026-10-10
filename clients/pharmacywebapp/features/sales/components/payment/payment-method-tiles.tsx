"use client"

import { useRef, type ComponentType, type KeyboardEvent } from "react"
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  Landmark,
  QrCode,
  Shield,
  Smartphone,
  Wallet,
  WalletCards,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type PaymentMethodValue =
  | "cash"
  | "card"
  | "fonepay"
  | "esewa"
  | "khalti"
  | "bank"
  | "insurance"
  | "credit"
  | "other"

export interface PaymentMethodOption {
  value: PaymentMethodValue
  label: string
  icon: ComponentType<{ className?: string }>
  /** Label for the reference field on non-cash legs. */
  referenceLabel?: string
  referencePlaceholder?: string
}

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "card", label: "Card", icon: CreditCard, referenceLabel: "Card slip / approval no.", referencePlaceholder: "e.g. 004512" },
  { value: "fonepay", label: "Fonepay", icon: QrCode, referenceLabel: "Fonepay transaction ID", referencePlaceholder: "From the customer's app or your Fonepay alert" },
  { value: "esewa", label: "eSewa", icon: Smartphone, referenceLabel: "eSewa transaction ID", referencePlaceholder: "e.g. 0007ABC" },
  { value: "khalti", label: "Khalti", icon: WalletCards, referenceLabel: "Khalti transaction ID", referencePlaceholder: "e.g. GhfX8…" },
  { value: "bank", label: "Bank", icon: Landmark, referenceLabel: "Bank transaction ID", referencePlaceholder: "Enter after the customer pays" },
  { value: "insurance", label: "Insurance", icon: Shield, referenceLabel: "Claim / policy no.", referencePlaceholder: "e.g. HIB claim number" },
  { value: "credit", label: "Credit", icon: CircleDollarSign, referenceLabel: "Note (optional)", referencePlaceholder: "e.g. due on payday" },
  { value: "other", label: "Other", icon: Wallet, referenceLabel: "Reference", referencePlaceholder: "What was received" },
]

export function paymentMethodOption(value: string): PaymentMethodOption {
  return PAYMENT_METHODS.find((m) => m.value === value) ?? PAYMENT_METHODS[PAYMENT_METHODS.length - 1]
}

interface PaymentMethodTilesProps {
  value: string
  onChange: (value: PaymentMethodValue) => void
  /** Accessible name of the group, e.g. "Payment 2 method". */
  label: string
  disabled?: boolean
}

/** Single-choice tile grid (radiogroup with roving arrow-key focus). */
export function PaymentMethodTiles({ value, onChange, label, disabled = false }: PaymentMethodTilesProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = Math.max(
    0,
    PAYMENT_METHODS.findIndex((m) => m.value === value),
  )

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const cols = 3
    let next = -1
    if (event.key === "ArrowRight") next = (index + 1) % PAYMENT_METHODS.length
    else if (event.key === "ArrowLeft") next = (index - 1 + PAYMENT_METHODS.length) % PAYMENT_METHODS.length
    else if (event.key === "ArrowDown") next = Math.min(PAYMENT_METHODS.length - 1, index + cols)
    else if (event.key === "ArrowUp") next = Math.max(0, index - cols)
    if (next < 0) return
    event.preventDefault()
    refs.current[next]?.focus()
    onChange(PAYMENT_METHODS[next].value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className="grid grid-cols-3 gap-1 rounded-xl border bg-muted/40 p-1"
    >
      {PAYMENT_METHODS.map((method, index) => {
        const Icon = method.icon
        const selected = method.value === value
        return (
          <button
            key={method.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === selectedIndex ? 0 : -1}
            disabled={disabled && !selected}
            onClick={() => onChange(method.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-xs font-medium",
              "transition-[background-color,color,box-shadow] duration-150 ease-out outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-40",
              selected
                ? "bg-card text-primary shadow-xs ring-1 ring-primary/50"
                : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            <span className="leading-tight">{method.label}</span>
          </button>
        )
      })}
    </div>
  )
}
