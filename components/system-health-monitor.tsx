"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TestHelpers } from "@/lib/testing/test-helpers"
import { toast } from "@/hooks/use-toast"

interface HealthStatus {
  database: boolean
  crud: boolean
  performance: boolean
  lastChecked: Date
}

export function SystemHealthMonitor() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>({
    database: false,
    crud: false,
    performance: false,
    lastChecked: new Date(),
  })
  const [isRunning, setIsRunning] = useState(false)

  const runHealthCheck = async () => {
    setIsRunning(true)

    try {
      const [database, crud, performance] = await Promise.all([
        TestHelpers.testDatabaseConnection(),
        TestHelpers.testCRUDOperations().then((results) => Object.values(results).every((result) => result === true)),
        TestHelpers.testPerformance(),
      ])

      setHealthStatus({
        database,
        crud,
        performance,
        lastChecked: new Date(),
      })

      const allHealthy = database && crud && performance
      toast({
        title: allHealthy ? "System Healthy" : "System Issues Detected",
        description: allHealthy ? "All systems are functioning normally" : "Some systems require attention",
        variant: allHealthy ? "default" : "destructive",
      })
    } catch (error) {
      console.error("[v0] Health check failed:", error)
      toast({
        title: "Health Check Failed",
        description: "Unable to complete system health check",
        variant: "destructive",
      })
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    // Run initial health check
    runHealthCheck()
  }, [])

  const getStatusBadge = (status: boolean) => (
    <Badge variant={status ? "default" : "destructive"}>{status ? "Healthy" : "Issues"}</Badge>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          System Health Monitor
          <Button onClick={runHealthCheck} disabled={isRunning} size="sm">
            {isRunning ? "Checking..." : "Run Check"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Database</span>
            {getStatusBadge(healthStatus.database)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">CRUD Operations</span>
            {getStatusBadge(healthStatus.crud)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Performance</span>
            {getStatusBadge(healthStatus.performance)}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">Last checked: {healthStatus.lastChecked.toLocaleString()}</div>
      </CardContent>
    </Card>
  )
}
