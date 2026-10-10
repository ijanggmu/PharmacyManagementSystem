"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { getIrdQueueHealth } from "@/lib/api/ird-api"
import { getHealthProbe, getJobsStatus, getMigrationStatus } from "@/lib/api/system-health-api"
import { pushHistory, type HistoryEntry } from "../lib/history"
import { overallStatus } from "../lib/status"

export const POLL_MS = 15_000
const MIGRATIONS_STALE_MS = 60_000

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange)
  return () => document.removeEventListener("visibilitychange", onChange)
}

/** True while the tab is visible; polling pauses when the document is hidden. */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  )
}

/** Re-render on an interval so relative labels ("12s ago") stay truthful between polls. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export interface HealthAccess {
  canViewPlatform: boolean
  canViewIrd: boolean
}

export function useSystemHealthData({ canViewPlatform, canViewIrd }: HealthAccess) {
  const [live, setLive] = useState(true)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const visible = useDocumentVisible()
  const interval = live && visible ? POLL_MS : false

  const record = useCallback((entry: HistoryEntry) => setHistory((prev) => pushHistory(prev, entry)), [])

  const readiness = useQuery({
    queryKey: ["system-health", "ready"],
    queryFn: async ({ signal }) => {
      try {
        const snapshot = await getHealthProbe("ready", signal)
        const status = overallStatus(snapshot, { loading: false, failed: false })
        record({
          at: Date.now(),
          status: status === "Loading" ? "Unreachable" : status,
          roundTripMs: snapshot.httpStatus === 0 ? null : snapshot.roundTripMs,
        })
        return snapshot
      } catch (err) {
        if (!signal.aborted) record({ at: Date.now(), status: "Unreachable", roundTripMs: null })
        throw err
      }
    },
    refetchInterval: interval,
    placeholderData: keepPreviousData,
    staleTime: 0,
    retry: 1,
  })
  const jobs = useQuery({
    queryKey: ["system-health", "jobs"],
    queryFn: getJobsStatus,
    enabled: canViewPlatform,
    refetchInterval: interval,
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
  const migrations = useQuery({
    queryKey: ["system-health", "migrations"],
    queryFn: getMigrationStatus,
    enabled: canViewPlatform,
    // Migrations only change on deploy — no need to poll them.
    staleTime: MIGRATIONS_STALE_MS,
    placeholderData: keepPreviousData,
  })
  const ird = useQuery({
    queryKey: ["system-health", "ird"],
    queryFn: getIrdQueueHealth,
    enabled: canViewIrd,
    refetchInterval: interval,
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const refreshAll = useCallback(() => {
    void readiness.refetch()
    if (canViewPlatform) {
      void jobs.refetch()
      void migrations.refetch()
    }
    if (canViewIrd) void ird.refetch()
  }, [readiness, jobs, migrations, ird, canViewPlatform, canViewIrd])

  const fetching = readiness.isFetching || jobs.isFetching || migrations.isFetching || ird.isFetching

  /** True when the latest readiness attempt failed (even if older data is still shown). */
  const readinessFailed = readiness.isError && readiness.errorUpdatedAt >= readiness.dataUpdatedAt

  return { live, setLive, visible, history, readiness, readinessFailed, jobs, migrations, ird, refreshAll, fetching }
}

export type SystemHealthData = ReturnType<typeof useSystemHealthData>
