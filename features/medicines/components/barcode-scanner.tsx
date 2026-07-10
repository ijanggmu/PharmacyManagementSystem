/**
 * Barcode Scanner Component
 * Webcam-based barcode scanning
 */

"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Camera, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  isOpen: boolean
  onClose: () => void
}

export function BarcodeScanner({ onScan, isOpen, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (isOpen) {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [isOpen])

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // Use back camera on mobile
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch (err) {
      setError("Failed to access camera. Please check permissions.")
      console.error("Camera access error:", err)
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const handleManualInput = (barcode: string) => {
    if (barcode.trim()) {
      onScan(barcode.trim())
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Scan Barcode</DialogTitle>
          <DialogDescription>Point your camera at a barcode or enter manually</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error ? (
            <div className="p-4 border border-destructive rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground mt-2">
                You can manually enter the barcode below
              </p>
            </div>
          ) : (
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {/* In production, integrate with a barcode scanning library like QuaggaJS or ZXing */}
              <div className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none" />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Or enter barcode manually:</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Enter barcode"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleManualInput(e.currentTarget.value)
                }
              }}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={onClose} variant="outline" className="flex-1">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            {!stream && (
              <Button onClick={startCamera} className="flex-1">
                <Camera className="h-4 w-4 mr-2" />
                Start Camera
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

