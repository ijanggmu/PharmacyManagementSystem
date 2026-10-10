// Security utilities for input sanitization and validation

// HTML tag removal
export function removeHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, '')
}

// XSS prevention
export function sanitizeForXSS(input: string): string {
  return input
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
}

// SQL injection prevention (basic)
export function sanitizeForSQL(input: string): string {
  return input
    .replace(/['";\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
}

// Comprehensive input sanitization
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input
  
  return input
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .replace(/['";\\]/g, '') // Remove SQL injection chars
    .replace(/--/g, '') // Remove SQL comments
    .replace(/\/\*/g, '') // Remove SQL block comments
    .replace(/\*\//g, '')
}

// Rate limiting helper
export class RateLimiter {
  private attempts = new Map<string, { count: number; resetTime: number }>()
  
  isAllowed(key: string, maxAttempts: number = 5, windowMs: number = 60000): boolean {
    const now = Date.now()
    const record = this.attempts.get(key)
    
    if (!record || now > record.resetTime) {
      this.attempts.set(key, { count: 1, resetTime: now + windowMs })
      return true
    }
    
    if (record.count >= maxAttempts) {
      return false
    }
    
    record.count++
    return true
  }
  
  reset(key: string): void {
    this.attempts.delete(key)
  }
}

// CSRF token validation
export function validateCSRFToken(token: string, expectedToken: string): boolean {
  return token === expectedToken && token.length > 0
}

// Input length validation
export function validateInputLength(input: string, min: number, max: number): boolean {
  return input.length >= min && input.length <= max
}

// Email format validation
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Phone format validation
export function validatePhone(phone: string): boolean {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/
  return phoneRegex.test(phone)
}

// Export all security functions
export default {
  removeHtmlTags,
  sanitizeForXSS,
  sanitizeForSQL,
  sanitizeInput,
  RateLimiter,
  validateCSRFToken,
  validateInputLength,
  validateEmail,
  validatePhone
}
