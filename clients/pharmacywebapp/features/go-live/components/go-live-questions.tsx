"use client"

import { useState } from "react"
import { CheckCircle2, Pencil } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/lib/i18n/i18n-provider"
import type { GoLiveTemplateOptions } from "@/features/go-live/lib/go-live-workbook"

type Answer = "suppliers" | "customers" | "consignment"

const STORAGE_KEY = "go-live:answers"

/** The owner's last answers (this browser only), or null when they haven't answered yet. */
export function storedAnswers(): GoLiveTemplateOptions | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GoLiveTemplateOptions>
    return {
      suppliers: parsed.suppliers === true,
      customers: parsed.customers === true,
      consignment: parsed.consignment === true,
      detail: parsed.detail === "full" ? "full" : "simple",
    }
  } catch {
    return null
  }
}

export function storeAnswers(options: GoLiveTemplateOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
  } catch {
    // Storage unavailable: the owner answers again next visit.
  }
}

function YesNo({ id, value, onChange }: { id: string; value: boolean | null; onChange: (value: boolean) => void }) {
  const t = useTranslations("goLive")
  return (
    <div className="flex shrink-0 gap-2" role="group" aria-labelledby={id}>
      {[true, false].map((option) => (
        <Button
          key={String(option)}
          type="button"
          size="sm"
          variant={value === option ? "default" : "outline"}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className="min-w-16"
        >
          {option ? t("questions.yes") : t("questions.no")}
        </Button>
      ))}
    </div>
  )
}

/** Step 1: three yes/no questions that decide which sheets and columns the owner's Excel file has. */
export function GoLiveQuestions({
  initial,
  onDone,
}: {
  initial: GoLiveTemplateOptions | null
  onDone: (options: GoLiveTemplateOptions) => void
}) {
  const t = useTranslations("goLive")
  const [answers, setAnswers] = useState<Record<Answer, boolean | null>>({
    suppliers: initial?.suppliers ?? null,
    customers: initial?.customers ?? null,
    consignment: initial?.consignment ?? null,
  })
  const questions: { key: Answer; title: string; hint: string }[] = [
    { key: "suppliers", title: t("questions.suppliers"), hint: t("questions.suppliersHint") },
    { key: "customers", title: t("questions.customers"), hint: t("questions.customersHint") },
    { key: "consignment", title: t("questions.consignment"), hint: t("questions.consignmentHint") },
  ]
  const complete = Object.values(answers).every((a) => a !== null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("questions.title")}</CardTitle>
        <CardDescription>{t("questions.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> {t("questions.medicines")}
        </p>
        <ul className="divide-y rounded-lg border">
          {questions.map((q) => (
            <li key={q.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p id={`go-live-q-${q.key}`} className="font-medium">
                  {q.title}
                </p>
                <p className="text-sm text-muted-foreground">{q.hint}</p>
              </div>
              <YesNo id={`go-live-q-${q.key}`} value={answers[q.key]} onChange={(v) => setAnswers((prev) => ({ ...prev, [q.key]: v }))} />
            </li>
          ))}
        </ul>
        <Button
          disabled={!complete}
          onClick={() =>
            onDone({
              suppliers: answers.suppliers === true,
              customers: answers.customers === true,
              consignment: answers.consignment === true,
              detail: initial?.detail ?? "simple",
            })
          }
        >
          {t("questions.continue")}
        </Button>
      </CardContent>
    </Card>
  )
}

/** Step 1 once answered: what the file will have, with a way back to the questions. */
export function GoLiveAnswers({ options, onChange, disabled }: { options: GoLiveTemplateOptions; onChange: () => void; disabled?: boolean }) {
  const t = useTranslations("goLive")
  const sheets = [
    t("questions.sheetMedicines"),
    ...(options.suppliers ? [t("questions.sheetSuppliers")] : []),
    ...(options.customers ? [t("questions.sheetCustomers")] : []),
    ...(options.consignment ? [t("questions.sheetConsignment")] : []),
  ]
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-sm">
      <span className="font-medium">{t("questions.answeredTitle")}:</span>
      {sheets.map((s) => (
        <Badge key={s} variant="secondary">
          {s}
        </Badge>
      ))}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onChange} disabled={disabled}>
        <Pencil aria-hidden /> {t("questions.change")}
      </Button>
    </div>
  )
}
