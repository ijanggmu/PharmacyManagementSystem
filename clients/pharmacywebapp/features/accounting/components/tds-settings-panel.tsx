"use client"

/**
 * TDS rates (Accounting › Finance setup): the tenant's TDS categories and the rate each pre-fills on an expense or a
 * supplier payment. Defaults follow the Nepal rates (rent 10%, service by a VAT-registered vendor 1.5%, service by a
 * non-VAT vendor 15%, commission 15%, contract 1.5%, interest 15%) — confirm them against the current Finance Act.
 * Saving needs Accounts.Update. A category is deactivated rather than deleted.
 */

import { useEffect, useMemo, useState } from "react"
import { Percent, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { InlineAlert, QueryState, ScrollTable, SectionHeading } from "@/features/accounting/components/accounting-ui"
import { useAccountPermissions } from "@/features/accounting/hooks/use-account-permissions"
import { useSaveTdsCategories, useTdsCategories } from "@/features/accounting/hooks/use-tds"
import { validateTdsCategoryDrafts, type TdsCategory, type TdsCategoryDraft } from "@/features/accounting/lib/tds"

function draftsFrom(categories: readonly TdsCategory[]): TdsCategoryDraft[] {
  return categories.map((c) => ({ code: c.code, name: c.name, rate: String(c.rate_percent), is_active: c.is_active }))
}

export function TdsSettingsPanel() {
  const { toast } = useToast()
  const perms = useAccountPermissions()
  const categories = useTdsCategories()
  const save = useSaveTdsCategories()
  const saved = useMemo(() => categories.data ?? [], [categories.data])
  const [drafts, setDrafts] = useState<TdsCategoryDraft[]>([])
  const [touched, setTouched] = useState(false)
  // Re-seed the editor whenever the saved list changes (first load, after a save).
  useEffect(() => setDrafts(draftsFrom(saved)), [saved])

  const errors = validateTdsCategoryDrafts(drafts)
  const dirty = JSON.stringify(drafts) !== JSON.stringify(draftsFrom(saved))
  const readOnly = !perms.canUpdate || save.isPending

  const patch = (index: number, change: Partial<TdsCategoryDraft>) =>
    setDrafts((rows) => rows.map((r, i) => (i === index ? { ...r, ...change } : r)))

  const submit = () => {
    setTouched(true)
    if (Object.keys(errors).length > 0) return
    save.mutate(drafts, {
      onSuccess: () => {
        setTouched(false)
        toast({ title: "TDS rates saved", description: "New expenses and supplier payments use these rates." })
      },
      onError: (e) => toast({ title: "Couldn't save the TDS rates", description: apiRequestErrorMessage(e), variant: "destructive" }),
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SectionHeading
          icon={Percent}
          title="TDS rates"
          description="Tax deducted at source: the categories you withhold under and the rate each one pre-fills. The amount on each expense or payment stays editable."
          actions={
            perms.canUpdate ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={readOnly}
                onClick={() => setDrafts((rows) => [...rows, { code: "", name: "", rate: "", is_active: true, is_new: true }])}
              >
                <Plus aria-hidden />
                Add category
              </Button>
            ) : null
          }
        />

        <InlineAlert tone="info" title="Confirm the rates against the current Finance Act">
          The defaults are Nepal&apos;s usual TDS rates (rent 10%, service by a VAT-registered vendor 1.5%, by a non-VAT vendor
          15%, commission 15%, contract 1.5%, interest 15%). Rates change with the budget — check them and edit as needed. TDS
          is withheld on the amount excluding VAT.
        </InlineAlert>

        <QueryState
          isLoading={categories.isLoading}
          error={categories.error}
          onRetry={() => void categories.refetch()}
          retrying={categories.isFetching}
          errorTitle="Couldn't load the TDS rates"
        >
          <ScrollTable label="TDS categories" maxHeight="max-h-none">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[9rem]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[7rem] text-right">Rate (%)</TableHead>
                <TableHead className="w-[6rem] text-center">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drafts.map((d, i) => (
                <TableRow key={d.is_new ? `new-${i}` : d.code}>
                  <TableCell className="align-top">
                    {d.is_new ? (
                      <Input
                        aria-label="Category code"
                        value={d.code}
                        onChange={(e) => patch(i, { code: e.target.value })}
                        placeholder="e.g. royalty"
                        maxLength={32}
                        disabled={readOnly}
                      />
                    ) : (
                      <span className="font-mono text-xs">{d.code}</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      aria-label={`Name of ${d.code || "new category"}`}
                      value={d.name}
                      onChange={(e) => patch(i, { name: e.target.value })}
                      maxLength={128}
                      disabled={readOnly}
                    />
                    <FieldError message={touched ? errors[i] : undefined} />
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      aria-label={`Rate of ${d.code || "new category"}`}
                      inputMode="decimal"
                      className="num text-right"
                      value={d.rate}
                      onChange={(e) => patch(i, { rate: e.target.value })}
                      disabled={readOnly}
                    />
                  </TableCell>
                  <TableCell className="text-center align-top">
                    <Switch
                      aria-label={`${d.code || "New category"} active`}
                      checked={d.is_active}
                      onCheckedChange={(checked) => patch(i, { is_active: checked })}
                      disabled={readOnly}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        </QueryState>

        {perms.canUpdate ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={!dirty || save.isPending} onClick={() => setDrafts(draftsFrom(saved))}>
              Discard changes
            </Button>
            <Button type="button" disabled={!dirty} loading={save.isPending} loadingText="Saving…" onClick={submit}>
              Save TDS rates
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">You can view the TDS rates. Changing them needs permission to update accounts.</p>
        )}
      </CardContent>
    </Card>
  )
}
