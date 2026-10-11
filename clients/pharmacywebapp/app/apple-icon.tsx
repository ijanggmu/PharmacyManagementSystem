import { ImageResponse } from "next/og"

// Home-screen icon for iOS / PWA installs. Same mark as public/icon.svg, full-bleed
// (iOS applies its own corner mask, so no rounded tile here).
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 32 32">
          <g transform="rotate(-45 16 16)">
            <rect x="7" y="11.5" width="18" height="9" rx="4.5" fill="#fff" fillOpacity="0.4" />
            <path d="M16 11.5h-4.5a4.5 4.5 0 0 0 0 9H16z" fill="#fff" />
          </g>
        </svg>
      </div>
    ),
    size
  )
}
