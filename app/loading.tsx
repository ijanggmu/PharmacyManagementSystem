import { BrandLoader } from "@/components/brand/brand-loader"

// Top-level hand-offs (landing → sign-in → first dashboard load) get the branded loader.
export default function Loading() {
  return <BrandLoader fullscreen label="Loading PharmaCare" />
}
