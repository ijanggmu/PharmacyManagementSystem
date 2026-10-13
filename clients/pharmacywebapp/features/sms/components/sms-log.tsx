"use client"

import { useState } from "react"
import { MessageSquare, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Pagination } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { SMS_STATUSES, type SmsMessage, type SmsStatus } from "@/features/sms/api-client"
import { useRetrySms, useSmsMessages } from "@/features/sms/hooks/use-sms"
import { smsKindLabel, smsStatusTone } from "@/features/sms/lib/sms-log"

const PAGE_SIZE = 25
const ALL = "all"
const KINDS = ["DuesReminder", "RefillReminder", "Receipt", "Test"] as const

function when(utc: string | null): string {
  return utc ? new Date(utc).toLocaleString() : "—"
}

/** The SMS log: newest first, filter by status and kind, retry a failed message. Numbers are masked by the API. */
export default function SmsLog({ canRetry }: { canRetry: boolean }) {
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<SmsStatus | typeof ALL>(ALL)
  const [kind, setKind] = useState<string>(ALL)
  const messages = useSmsMessages({
    page,
    pageSize: PAGE_SIZE,
    status: status === ALL ? null : status,
    kind: kind === ALL ? null : kind,
  })
  const retry = useRetrySms()

  const onRetry = (message: SmsMessage) =>
    retry.mutate(message.id, {
      onSuccess: () => toast({ title: "SMS queued again" }),
      onError: (error) =>
        toast({ title: "Couldn't retry the SMS", description: apiRequestErrorMessage(error) || error.message, variant: "destructive" }),
    })

  const items = messages.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as SmsStatus | typeof ALL)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {SMS_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-44" aria-label="Kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All messages</SelectItem>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {smsKindLabel(k)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {messages.isLoading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : messages.isError ? (
        <ErrorState
          size="compact"
          title="Couldn't load the SMS log"
          message={apiRequestErrorMessage(messages.error) || "Failed to load the SMS log."}
          onRetry={() => messages.refetch()}
          retrying={messages.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No SMS yet" description="Reminders, receipts and test messages will show here." />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Provider answer</TableHead>
                <TableHead className="text-right">SMS</TableHead>
                {canRetry ? <TableHead className="sr-only">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    <span className="block">{when(m.createdAtUtc)}</span>
                    <span className="text-muted-foreground">
                      {smsKindLabel(m.kind)} · {m.trigger === "Automatic" ? "automatic" : "manual"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    <span className="block">{m.recipientName ?? "—"}</span>
                    <span className="num text-muted-foreground">{m.phoneMasked}</span>
                  </TableCell>
                  <TableCell className="max-w-md text-xs">{m.body}</TableCell>
                  <TableCell>
                    <Badge variant={smsStatusTone(m.status)}>{m.status}</Badge>
                    {m.status === "Queued" && m.nextAttemptAtUtc ? (
                      <span className="mt-1 block text-xs text-muted-foreground">from {when(m.nextAttemptAtUtc)}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">
                    {m.lastError ?? m.responseMessage ?? "—"}
                    {m.responseCode ? <span className="num block">code {m.responseCode}</span> : null}
                  </TableCell>
                  <TableCell className="num text-right text-xs">
                    {m.segments}
                    {m.credits != null ? <span className="block text-muted-foreground">{m.credits} cr</span> : null}
                  </TableCell>
                  {canRetry ? (
                    <TableCell className="text-right">
                      {m.status === "Failed" ? (
                        <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => onRetry(m)}>
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          Retry
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {messages.data ? (
        <Pagination
          currentPage={page}
          totalPages={messages.data.totalPages}
          totalItems={messages.data.totalCount}
          itemsPerPage={PAGE_SIZE}
          startIndex={(page - 1) * PAGE_SIZE}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  )
}
