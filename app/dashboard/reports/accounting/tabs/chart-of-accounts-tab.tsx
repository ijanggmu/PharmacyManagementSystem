"use client"

import { useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { accountingApi, type AccountingAccount } from "@/features/accounting/api-client"
import { Loader2 } from "lucide-react"

interface ChartOfAccountsTabProps {
  accounts: AccountingAccount[]
  setAccounts: Dispatch<SetStateAction<AccountingAccount[]>>
}

export default function ChartOfAccountsTab({ accounts, setAccounts }: ChartOfAccountsTabProps) {
  const { toast } = useToast()

  const [newAccountCode, setNewAccountCode] = useState("")
  const [newAccountName, setNewAccountName] = useState("")
  const [newAccountType, setNewAccountType] = useState<"asset" | "liability" | "equity" | "revenue" | "expense">("asset")
  const [accountSaving, setAccountSaving] = useState(false)

  const createAccountHead = async () => {
    if (!newAccountCode.trim() || !newAccountName.trim()) {
      toast({ title: "Code and name are required", variant: "destructive" })
      return
    }
    setAccountSaving(true)
    try {
      await accountingApi.createAccountHead({
        code: newAccountCode.trim(),
        name: newAccountName.trim(),
        account_type: newAccountType,
      })
      toast({ title: "Account head created" })
      setNewAccountCode("")
      setNewAccountName("")
      const data = await accountingApi.getAccounts()
      setAccounts(data || [])
    } catch (e) {
      toast({
        title: "Create account head failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setAccountSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chart of accounts</CardTitle>
        <CardDescription>Manage tenant account heads used by voucher posting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-4 space-y-3">
          <h3 className="font-medium">Create account head</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Input
              placeholder="Code (e.g. 3200)"
              value={newAccountCode}
              onChange={(e) => setNewAccountCode(e.target.value)}
            />
            <Input
              className="sm:col-span-2"
              placeholder="Account name"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
            />
            <Select value={newAccountType} onValueChange={(v) => setNewAccountType(v as typeof newAccountType)}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asset">asset</SelectItem>
                <SelectItem value="liability">liability</SelectItem>
                <SelectItem value="equity">equity</SelectItem>
                <SelectItem value="revenue">revenue</SelectItem>
                <SelectItem value="expense">expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void createAccountHead()} disabled={accountSaving}>
            {accountSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create account
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No account heads found.
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-mono">{account.code}</TableCell>
                  <TableCell>{account.name}</TableCell>
                  <TableCell>{account.account_type}</TableCell>
                  <TableCell>{account.is_active ? "Active" : "Inactive"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
