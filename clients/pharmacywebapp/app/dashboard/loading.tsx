import { PageSkeleton } from "@/components/shared/page-skeleton"

// Fallback for every dashboard route without its own loading.tsx — the shell stays put and
// this placeholder appears the instant a link is clicked.
export default function Loading() {
  return <PageSkeleton />
}
