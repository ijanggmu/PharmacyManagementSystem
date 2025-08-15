export enum ErrorType {
  VALIDATION = "VALIDATION",
  NETWORK = "NETWORK",
  DATABASE = "DATABASE",
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  BUSINESS_LOGIC = "BUSINESS_LOGIC",
  SYSTEM = "SYSTEM",
  USER_INPUT = "USER_INPUT",
}

export enum ErrorSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export interface ErrorContext {
  userId?: string
  sessionId?: string
  userAgent?: string
  url?: string
  timestamp: string
  additionalData?: Record<string, any>
}

export class PharmacyError extends Error {
  public readonly type: ErrorType
  public readonly severity: ErrorSeverity
  public readonly code: string
  public readonly context: ErrorContext
  public readonly userMessage: string
  public readonly recoverable: boolean
  public readonly retryable: boolean

  constructor(
    message: string,
    type: ErrorType,
    severity: ErrorSeverity,
    code: string,
    userMessage: string,
    recoverable = true,
    retryable = false,
    context: Partial<ErrorContext> = {},
  ) {
    super(message)
    this.name = "PharmacyError"
    this.type = type
    this.severity = severity
    this.code = code
    this.userMessage = userMessage
    this.recoverable = recoverable
    this.retryable = retryable
    this.context = {
      timestamp: new Date().toISOString(),
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "",
      ...context,
    }
  }
}

// Predefined error classes
export class ValidationError extends PharmacyError {
  constructor(message: string, code: string, userMessage: string, context?: Partial<ErrorContext>) {
    super(message, ErrorType.VALIDATION, ErrorSeverity.MEDIUM, code, userMessage, true, false, context)
  }
}

export class NetworkError extends PharmacyError {
  constructor(message: string, code: string, userMessage: string, context?: Partial<ErrorContext>) {
    super(message, ErrorType.NETWORK, ErrorSeverity.HIGH, code, userMessage, true, true, context)
  }
}

export class DatabaseError extends PharmacyError {
  constructor(message: string, code: string, userMessage: string, context?: Partial<ErrorContext>) {
    super(message, ErrorType.DATABASE, ErrorSeverity.HIGH, code, userMessage, true, true, context)
  }
}

export class BusinessLogicError extends PharmacyError {
  constructor(message: string, code: string, userMessage: string, context?: Partial<ErrorContext>) {
    super(message, ErrorType.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, code, userMessage, true, false, context)
  }
}

export class SystemError extends PharmacyError {
  constructor(message: string, code: string, userMessage: string, context?: Partial<ErrorContext>) {
    super(message, ErrorType.SYSTEM, ErrorSeverity.CRITICAL, code, userMessage, false, false, context)
  }
}
