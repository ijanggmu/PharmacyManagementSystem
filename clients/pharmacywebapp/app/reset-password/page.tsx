import { redirect } from "next/navigation"

/**
 * The backend builds the emailed reset link as `${OriginUrl}/reset-password?token=...&email=...&tenant=...`
 * (see UserPasswordService.ForgotPasswordAsync) — at the site root, not under /auth. The actual reset
 * form lives at /auth/reset-password alongside the other standalone auth pages; this route exists only
 * to catch the literal emailed path and forward it there with the query string intact.
 */
export default async function ResetPasswordRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value)
  }
  const qs = query.toString()
  redirect(qs ? `/auth/reset-password?${qs}` : "/auth/reset-password")
}
