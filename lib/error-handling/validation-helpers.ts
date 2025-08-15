import { ValidationError } from "./error-types"

export interface ValidationRule<T = any> {
  field: string
  message: string
  validator: (value: T, data?: Record<string, any>) => boolean
}

export interface ValidationResult {
  isValid: boolean
  errors: Record<string, string[]>
  firstError?: string
}

export class ValidationHelper {
  static validateField<T>(
    value: T,
    rules: ValidationRule<T>[],
    data?: Record<string, any>,
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    for (const rule of rules) {
      if (!rule.validator(value, data)) {
        errors.push(rule.message)
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  static validateObject(data: Record<string, any>, fieldRules: Record<string, ValidationRule[]>): ValidationResult {
    const errors: Record<string, string[]> = {}
    let firstError: string | undefined

    for (const [field, rules] of Object.entries(fieldRules)) {
      const value = data[field]
      const fieldValidation = this.validateField(value, rules, data)

      if (!fieldValidation.isValid) {
        errors[field] = fieldValidation.errors
        if (!firstError) {
          firstError = fieldValidation.errors[0]
        }
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      firstError,
    }
  }

  static throwValidationError(validationResult: ValidationResult, code: string): never {
    const errorMessage = Object.entries(validationResult.errors)
      .map(([field, fieldErrors]) => `${field}: ${fieldErrors.join(", ")}`)
      .join("; ")

    throw new ValidationError(
      errorMessage,
      code,
      validationResult.firstError || "Please check your input and try again.",
      { validationErrors: validationResult.errors },
    )
  }
}

// Common validation rules
export const CommonValidationRules = {
  required: <T>(message: string = "This field is required"): ValidationRule<T> => ({\
    field: "required",
    message,
    validator: (value) => {\
      if (value === null || value === undefined) return false
      if (typeof value === "string") return value.trim().length > 0
      if (Array.isArray(value)) return value.length > 0
      return true
    },
  }),

  email: (message: string = "Please enter a valid email address"): ValidationRule<string> => ({\
    field: "email",
    message,
    validator: (value) => {\
      if (!value) return true // Allow empty if not required
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(value)
    },
  }),

  minLength: (min: number, message?: string): ValidationRule<string> => ({\
    field: "minLength",
    message: message || `Must be at least ${min} characters long`,
    validator: (value) => {\
      if (!value) return true // Allow empty if not required
      return value.length >= min
    },
  }),

  maxLength: (max: number, message?: string): ValidationRule<string> => ({\
    field: "maxLength",
    message: message || `Must be no more than ${max} characters long`,
    validator: (value) => {\
      if (!value) return true // Allow empty if not required\
      return value.length <= max
    },
  }),

  numeric: (message: string = "Must be a valid number\"): ValidationRule<string | number> => ({\
    field: "numeric",
    message,
    validator: (value) => {\
      if (!value && value !== 0) return true // Allow empty if not required
      return !isNaN(Number(value))
    },
  }),

  positive: (message: string = "Must be a positive number\"): ValidationRule<string | number> => ({\
    field: "positive",
    message,
    validator: (value) => {\
      if (!value && value !== 0) return true // Allow empty if not required
      const num = Number(value)
      return !isNaN(num) && num > 0
    },
  }),

  phone: (message: string = "Please enter a valid phone number"): ValidationRule<string> => ({\
    field: "phone",
    message,
    validator: (value) => {\
      if (!value) return true // Allow empty if not required
      const phoneRegex = /^\+?[\d\s\-$$$$]+$/
      return phoneRegex.test(value) && value.replace(/\D/g, "").length >= 10
    },
  }),

  date: (message: string = "Please enter a valid date"): ValidationRule<string> => ({\
    field: "date",
    message,
    validator: (value) => {\
      if (!value) return true // Allow empty if not required
      const date = new Date(value)
      return !isNaN(date.getTime())
    },
  }),

  futureDate: (message: string = "Date must be in the future"): ValidationRule<string> => ({\
    field: "futureDate",
    message,
    validator: (value) => {\
      if (!value) return true // Allow empty if not required
      const date = new Date(value)
      return !isNaN(date.getTime()) && date > new Date()
    },
  }),

  pastDate: (message: string = "Date must be in the past"): ValidationRule<string> => ({\
    field: "pastDate",
    message,
    validator: (value) => {\
      if (!value) return true // Allow empty if not required
      const date = new Date(value)\
      return !isNaN(date.getTime()) && date < new Date()
    },
  }),
}\
