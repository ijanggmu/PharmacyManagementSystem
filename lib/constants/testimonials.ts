/**
 * Customer testimonials for the landing page.
 *
 * Only add real, attributable quotes with the customer's permission. The landing
 * section is hidden while this list is empty — no testimonial beats a made-up one
 * (and invented endorsements can breach consumer-protection rules).
 */

export interface Testimonial {
  quote: string
  /** Person's name as they agreed to be credited, e.g. "Sita Sharma". */
  name: string
  /** Role and business, e.g. "Owner, Sunrise Pharmacy, Pokhara". */
  role: string
}

export const TESTIMONIALS: readonly Testimonial[] = []
