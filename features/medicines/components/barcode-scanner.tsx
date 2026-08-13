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

/** Chromium-only Web API — feature-detected, no polyfill. Safari/Firefox fall back
 *  to manual entry, same as before this was wired up. */
type DetectedBarcode = { rawValue: string }
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike
  }
}

export function BarcodeScanner({ onScan, isOpen, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const rafRef = useRef<number | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState("")
  const [detectorSupported, setDetectorSupported] = useState(true)

  useEffect(() => {
    if (isOpen) {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const scanLoop = () => {
    const video = videoRef.current
    const detector = detectorRef.current
    if (!video || !detector || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop)
      return
    }
    detector
      .detect(video)
      .then((codes) => {
        if (codes.length > 0 && codes[0].rawValue) {
          handleManualInput(codes[0].rawValue)
          return
        }
        rafRef.current = requestAnimationFrame(scanLoop)
      })
      .catch(() => {
        rafRef.current = requestAnimationFrame(scanLoop)
      })
  }

  const startCamera = async () => {
    if (typeof window !== "undefined" && !window.BarcodeDetector) {
      setDetectorSupported(false)
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // Use back camera on mobile
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      if (typeof window !== "undefined" && window.BarcodeDetector) {
        detectorRef.current = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        })
        rafRef.current = requestAnimationFrame(scanLoop)
      }
    } catch (err) {
      setError("Failed to access camera. Please check permissions.")
      console.error("Camera access error:", err)
    }
  }

  const stopCamera = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    detectorRef.current = null
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
              <div className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none" />
              {!detectorSupported && (
                <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-xs text-center py-1.5">
                  Auto-scan isn't supported in this browser — enter the barcode manually below
                </div>
              )}
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

