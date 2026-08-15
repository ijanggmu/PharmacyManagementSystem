"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle2, XCircle, RefreshCw, Database, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiGet } from "@/lib/api/client-helpers"

interface MigrationStatus {
  migration_name: string
  status: "APPLIED" | "MISSING"
  applied_at?: string
  executed_by?: string
}

interface AppliedMigration {
  migration_name: string
  applied_at?: string
  executed_by?: string
}

interface SchemaChecks {
  is_taxable?: boolean
  controlled_substance?: boolean
  audit_logs?: boolean
  warehouses?: boolean
  medicine_batches?: boolean
  notifications?: boolean
  system_settings?: boolean
  sale_payments?: boolean
}

const EXPECTED_MIGRATIONS = [
  "01-create-pharmacy-tables.sql",
  "02-seed-initial-data.sql",
  "03-add-controlled-substance-column.sql",
  "04-create-medicine-returns-table.sql",
  "05-create-sales-refunds-table.sql",
  "06-create-returns-tables.sql",
  "07-add-timestamps.sql",
  "08-create-audit-logs.sql",
  "09-create-purchase-orders.sql",
  "10-create-warehouses.sql",
  "11-create-medicine-batches.sql",
  "12-create-serial-numbers.sql",
  "13-create-notifications-table.sql",
  "14-create-system-settings.sql",
  "15-add-is-taxable-column.sql",
  "16-add-customer-insurance-columns.sql",
]

export default function MigrationStatusChecker() {
  const [migrations, setMigrations] = useState<MigrationStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [schemaChecks, setSchemaChecks] = useState<SchemaChecks>({})
  const { toast } = useToast()

  const checkMigrations = async () => {
    setIsLoading(true)
    try {
      const response = await apiGet<{ appliedMigrations: AppliedMigration[]; schemaChecks: SchemaChecks }>(
        "/api/system/migration-status"
      )
      const appliedMigrations = response.appliedMigrations || []

      const migrationStatus: MigrationStatus[] = EXPECTED_MIGRATIONS.map((name) => {
        const applied = appliedMigrations?.find((m) => m.migration_name === name)
        return {
          migration_name: name,
          status: applied ? "APPLIED" : "MISSING",
          applied_at: applied?.applied_at,
          executed_by: applied?.executed_by,
        }
      })

      setMigrations(migrationStatus)
      setSchemaChecks(response.schemaChecks || {})
    } catch (error) {
      console.error("Error checking migrations:", error)
      toast({
        title: "Error",
        description: "Failed to check migration status",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    checkMigrations()
  }, [])

  const appliedCount = migrations.filter((m) => m.status === "APPLIED").length
  const missingCount = migrations.filter((m) => m.status === "MISSING").length

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Migration Status Summary
          </CardTitle>
          <CardDescription>
            Overview of database migration status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{appliedCount}</div>
              <div className="text-sm text-gray-600">Applied</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{missingCount}</div>
              <div className="text-sm text-gray-600">Missing</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{EXPECTED_MIGRATIONS.length}</div>
              <div className="text-sm text-gray-600">Total</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schema Checks */}
      <Card>
        <CardHeader>
          <CardTitle>Schema Element Checks</CardTitle>
          <CardDescription>Key database elements verification</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              {schemaChecks.is_taxable ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className="text-sm">is_taxable column</span>
            </div>
            <div className="flex items-center gap-2">
              {schemaChecks.controlled_substance ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className="text-sm">controlled_substance</span>
            </div>
            <div className="flex items-center gap-2">
              {schemaChecks.audit_logs ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className="text-sm">audit_logs table</span>
            </div>
            <div className="flex items-center gap-2">
              {schemaChecks.warehouses ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className="text-sm">warehouses table</span>
            </div>
            <div className="flex items-center gap-2">
              {schemaChecks.medicine_batches ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className="text-sm">medicine_batches</span>
            </div>
            <div className="flex items-center gap-2">
              {schemaChecks.notifications ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className="text-sm">notifications</span>
            </div>
            <div className="flex items-center gap-2">
              {schemaChecks.system_settings ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className="text-sm">system_settings</span>
            </div>
            <div className="flex items-center gap-2">
              {schemaChecks.sale_payments ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className="text-sm">sale_payments table</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Migrations List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Migration Details</CardTitle>
              <CardDescription>Individual migration status</CardDescription>
            </div>
            <Button onClick={checkMigrations} disabled={isLoading} variant="outline" size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Checking migrations...</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Migration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Applied At</TableHead>
                    <TableHead>Executed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {migrations.map((migration) => (
                    <TableRow key={migration.migration_name}>
                      <TableCell className="font-mono text-sm">
                        {migration.migration_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={migration.status === "APPLIED" ? "default" : "destructive"}
                        >
                          {migration.status === "APPLIED" ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Applied
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 mr-1" />
                              Missing
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {migration.applied_at
                          ? new Date(migration.applied_at).toLocaleString()
                          : "-"}
                      </TableCell>
                      <TableCell>{migration.executed_by || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      {missingCount > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Missing Migrations Detected</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              {missingCount} migration(s) are missing. To apply them:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>Go to your Supabase SQL Editor</li>
              <li>Run the missing migration scripts in order from the scripts/ directory</li>
              <li>After running each migration, record it using:</li>
              <li className="ml-4 font-mono text-xs bg-muted p-2 rounded mt-1">
                SELECT record_migration(&apos;XX-migration-name.sql&apos;, &apos;your_name&apos;);
              </li>
              <li>Refresh this page to see updated status</li>
            </ol>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

