"use client"

import type React from "react"

import { useCallback, useEffect, useRef, useState } from "react"

// Debounce hook for search inputs
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

// Throttle hook for scroll events
export function useThrottle<T>(value: T, limit: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value)
  const lastRan = useRef<number>(Date.now())

  useEffect(() => {
    const handler = setTimeout(
      () => {
        if (Date.now() - lastRan.current >= limit) {
          setThrottledValue(value)
          lastRan.current = Date.now()
        }
      },
      limit - (Date.now() - lastRan.current),
    )

    return () => {
      clearTimeout(handler)
    }
  }, [value, limit])

  return throttledValue
}

// Intersection Observer hook for lazy loading
export function useIntersectionObserver(
  elementRef: React.RefObject<Element>,
  options: IntersectionObserverInit = {},
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting)
      },
      {
        threshold: 0.1,
        ...options,
      },
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [elementRef, options])

  return isIntersecting
}

// Virtual scrolling hook for large lists
export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
): {
  visibleItems: T[]
  startIndex: number
  endIndex: number
  totalHeight: number
  offsetY: number
} {
  const [scrollTop, setScrollTop] = useState(0)

  const startIndex = Math.floor(scrollTop / itemHeight)
  const endIndex = Math.min(startIndex + Math.ceil(containerHeight / itemHeight) + 1, items.length - 1)

  const visibleItems = items.slice(startIndex, endIndex + 1)
  const totalHeight = items.length * itemHeight
  const offsetY = startIndex * itemHeight

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  return {
    visibleItems,
    startIndex,
    endIndex,
    totalHeight,
    offsetY,
    handleScroll,
  }
}

// Performance monitoring
export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics: Map<string, number[]> = new Map()

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  public startTimer(label: string): () => void {
    const startTime = performance.now()

    return () => {
      const endTime = performance.now()
      const duration = endTime - startTime

      if (!this.metrics.has(label)) {
        this.metrics.set(label, [])
      }

      this.metrics.get(label)!.push(duration)

      // Log slow operations in development
      if (process.env.NODE_ENV === "development" && duration > 100) {
        console.warn(`Slow operation detected: ${label} took ${duration.toFixed(2)}ms`)
      }
    }
  }

  public getMetrics(label: string): { avg: number; min: number; max: number; count: number } | null {
    const measurements = this.metrics.get(label)
    if (!measurements || measurements.length === 0) return null

    const avg = measurements.reduce((sum, val) => sum + val, 0) / measurements.length
    const min = Math.min(...measurements)
    const max = Math.max(...measurements)

    return { avg, min, max, count: measurements.length }
  }

  public getAllMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const result: Record<string, any> = {}

    for (const [label] of this.metrics) {
      const metrics = this.getMetrics(label)
      if (metrics) {
        result[label] = metrics
      }
    }

    return result
  }

  public clearMetrics(): void {
    this.metrics.clear()
  }
}

// React hook for performance monitoring
export function usePerformanceMonitor(label: string) {
  const monitor = PerformanceMonitor.getInstance()

  const startTimer = useCallback(() => {
    return monitor.startTimer(label)
  }, [monitor, label])

  const getMetrics = useCallback(() => {
    return monitor.getMetrics(label)
  }, [monitor, label])

  return { startTimer, getMetrics }
}

// Memory usage monitoring
export function useMemoryMonitor(): {
  memoryUsage: number | null
  isHighMemoryUsage: boolean
} {
  const [memoryUsage, setMemoryUsage] = useState<number | null>(null)

  useEffect(() => {
    const checkMemoryUsage = () => {
      if ("memory" in performance) {
        const memory = (performance as any).memory
        const usedMB = memory.usedJSHeapSize / 1024 / 1024
        setMemoryUsage(usedMB)
      }
    }

    checkMemoryUsage()
    const interval = setInterval(checkMemoryUsage, 5000) // Check every 5 seconds

    return () => clearInterval(interval)
  }, [])

  const isHighMemoryUsage = memoryUsage !== null && memoryUsage > 100 // 100MB threshold

  return { memoryUsage, isHighMemoryUsage }
}
