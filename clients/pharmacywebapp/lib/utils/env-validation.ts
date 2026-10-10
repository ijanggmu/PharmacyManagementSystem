/**
 * Environment Variable Validation
 * Validates required environment variables on startup
 */

const requiredEnvVars: Record<string, string | undefined> = {
}

const optionalEnvVars: Record<string, string | undefined> = {
}

export function validateEnvVars(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check required variables
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value || value.trim() === "") {
      errors.push(`Missing required environment variable: ${key}`)
    }
  }

  // Warn about optional but recommended variables
  const warnings: string[] = []
  for (const [key, value] of Object.entries(optionalEnvVars)) {
    if (!value || value.trim() === "") {
      warnings.push(`Optional environment variable not set: ${key}`)
    }
  }

  if (warnings.length > 0) {
    console.warn("Environment variable warnings:", warnings)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// Validate on module load (only in server-side)
if (typeof window === "undefined") {
  const validation = validateEnvVars()
  if (!validation.valid) {
    console.error("Environment variable validation failed:", validation.errors)
    // Don't throw in development to allow for gradual setup
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required environment variables: ${validation.errors.join(", ")}`)
    }
  }
}

