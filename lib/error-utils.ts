export class PharmacyError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode = 500,
    public context?: Record<string, any>,
  ) {
    super(message)
    this.name = "PharmacyError"
  }
}

export class ValidationError extends PharmacyError {
  constructor(message: string, field?: string) {
    super(message, "VALIDATION_ERROR", 400, { field })
    this.name = "ValidationError"
  }
}

export class DatabaseError extends PharmacyError {
  constructor(message: string, operation?: string) {
    super(message, "DATABASE_ERROR", 500, { operation })
    this.name = "DatabaseError"
  }
}

export class AuthenticationError extends PharmacyError {
  constructor(message = "Authentication required") {
    super(message, "AUTH_ERROR", 401)
    this.name = "AuthenticationError"
  }
}

export class AuthorizationError extends PharmacyError {
  constructor(message = "Insufficient permissions") {
    super(message, "AUTHORIZATION_ERROR", 403)
    this.name = "AuthorizationError"
  }
}

export class InventoryError extends PharmacyError {
  constructor(message: string, medicineId?: string) {
    super(message, "INVENTORY_ERROR", 400, { medicineId })
    this.name = "InventoryError"
  }
}

export function handleError(error: unknown): PharmacyError {
  if (error instanceof PharmacyError) {
    return error
  }

  if (error instanceof Error) {
    return new PharmacyError(error.message, "UNKNOWN_ERROR", 500)
  }

  return new PharmacyError("An unknown error occurred", "UNKNOWN_ERROR", 500)
}

export function logError(error: Error, context?: Record<string, any>) {
  console.error("Application Error:", {
    name: error.name,
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
  })

  // In production, you would send this to an error tracking service
  // like Sentry, LogRocket, or similar
}
