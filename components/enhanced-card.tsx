"use client"

import type React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface EnhancedCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  gradient?: boolean
  glass?: boolean
  animation?: "slideUp" | "fadeIn" | "scaleIn"
  delay?: number
}

export default function EnhancedCard({
  children,
  className,
  hover = true,
  gradient = false,
  glass = false,
  animation = "fadeIn",
  delay = 0,
}: EnhancedCardProps) {
  return (
    <Card
      className={cn(
        "border-0 shadow-lg transition-all duration-300",
        hover && "card-hover cursor-pointer",
        gradient && "bg-gradient-to-br from-white to-gray-50",
        glass && "glass",
        animation === "slideUp" && "animate-slide-in-up",
        animation === "fadeIn" && "animate-fade-in",
        animation === "scaleIn" && "animate-scale-in",
        className,
      )}
      style={{
        animationDelay: `${delay}ms`,
      }}
    >
      {children}
    </Card>
  )
}

export { CardContent, CardDescription, CardHeader, CardTitle }
