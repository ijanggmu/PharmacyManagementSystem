/**
 * Support contact details shown on error screens.
 *
 * Configure per deployment with NEXT_PUBLIC_SUPPORT_EMAIL / NEXT_PUBLIC_SUPPORT_PHONE.
 * When unset, error screens point users to their pharmacy administrator instead of
 * showing a made-up address — a wrong contact is worse than none during an outage.
 */

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export const SUPPORT_EMAIL = clean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL)
export const SUPPORT_PHONE = clean(process.env.NEXT_PUBLIC_SUPPORT_PHONE)

/** `tel:` href with spaces, dashes and parentheses stripped. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`
}
