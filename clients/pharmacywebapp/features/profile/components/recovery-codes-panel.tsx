"use client"

import { useState } from "react"
import { AlertTriangle, Check, Copy, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { recoveryCodesFileText } from "@/lib/api/two-factor"

/**
 * One-time display of freshly issued recovery codes. The server never returns them again, so the
 * panel offers copy and download and says so plainly.
 */
export function RecoveryCodesPanel({ codes }: { codes: readonly string[] }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: "Couldn't copy", description: "Select the codes and copy them manually.", variant: "destructive" })
    }
  }

  const download = () => {
    const blob = new Blob([recoveryCodesFileText(codes)], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "pharmacare-recovery-codes.txt"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <div
        role="note"
        className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5 text-sm text-foreground"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p>
          Save these codes somewhere safe, like a password manager.{" "}
          <span className="font-medium">They won&apos;t be shown again.</span> Each code signs you in once if you lose
          your phone.
        </p>
      </div>

      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border bg-muted/40 px-4 py-3 font-mono text-sm tracking-wide text-foreground"
      >
        {codes.map((code) => (
          <li key={code} className="select-all">
            {code}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="flex-1" onClick={() => void copyAll()}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={download}>
          <Download aria-hidden />
          Download .txt
        </Button>
      </div>
    </div>
  )
}
