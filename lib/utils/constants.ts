// Application constants
export const APP_CONFIG = {
  name: "PharmaCare Management System",
  version: "1.0.0",
  description: "Comprehensive pharmacy management solution",
  author: "PharmaCare Team",
  supportEmail: "support@pharmacare.com",
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedFileTypes: ["image/jpeg", "image/png", "image/gif", "application/pdf"],
} as const

// Database constants
export const DB_LIMITS = {
  maxQueryResults: 1000,
  defaultPageSize: 20,
  maxPageSize: 100,
  maxSearchLength: 255,
  maxTextFieldLength: 1000,
  maxLongTextLength: 5000,
} as const

// Business rules constants
export const BUSINESS_RULES = {
  prescription: {
    maxValidityDays: 30,
    maxRefills: 5,
    requiresPharmacistApproval: ["controlled_substance", "high_risk"],
  },
  inventory: {
    lowStockThreshold: 0.2, // 20% of minimum stock
    criticalStockThreshold: 0.1, // 10% of minimum stock
    expiryWarningDays: 30,
    maxStockAdjustment: 1000,
  },
  sales: {
    maxDiscountPercentage: 50,
    taxRate: 0.13, // Nepal VAT — actual rate always resolved from system_settings.tax_rate
    maxCashPayment: 10000,
    requiresManagerApproval: 5000,
  },
  customer: {
    maxAge: 150,
    minAge: 0,
    maxEmergencyContacts: 3,
    insuranceNumberLength: 20,
  },
} as const

// UI constants
export const UI_CONFIG = {
  animations: {
    duration: {
      fast: 150,
      normal: 300,
      slow: 500,
    },
    easing: {
      easeIn: "cubic-bezier(0.4, 0, 1, 1)",
      easeOut: "cubic-bezier(0, 0, 0.2, 1)",
      easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    },
  },
  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    "2xl": 1536,
  },
  colors: {
    primary: {
      50: "#eff6ff",
      100: "#dbeafe",
      500: "#3b82f6",
      600: "#2563eb",
      700: "#1d4ed8",
      900: "#1e3a8a",
    },
    success: {
      50: "#f0fdf4",
      100: "#dcfce7",
      500: "#22c55e",
      600: "#16a34a",
      700: "#15803d",
    },
    warning: {
      50: "#fffbeb",
      100: "#fef3c7",
      500: "#f59e0b",
      600: "#d97706",
      700: "#b45309",
    },
    error: {
      50: "#fef2f2",
      100: "#fee2e2",
      500: "#ef4444",
      600: "#dc2626",
      700: "#b91c1c",
    },
  },
} as const

// API constants
export const API_CONFIG = {
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  maxRetryDelay: 10000, // 10 seconds
  endpoints: {
    medicines: "/api/medicines",
    customers: "/api/customers",
    prescriptions: "/api/prescriptions",
    sales: "/api/sales",
    suppliers: "/api/suppliers",
    categories: "/api/categories",
    reports: "/api/reports",
    analytics: "/api/analytics",
  },
} as const

// Validation constants
export const VALIDATION_RULES = {
  medicine: {
    name: { minLength: 2, maxLength: 100 },
    strength: { minLength: 1, maxLength: 50 },
    price: { min: 0.01, max: 10000 },
    stock: { min: 0, max: 100000 },
    barcode: { length: 12 },
  },
  customer: {
    name: { minLength: 2, maxLength: 50 },
    email: { maxLength: 100 },
    phone: { minLength: 10, maxLength: 15 },
    address: { maxLength: 200 },
  },
  prescription: {
    number: { minLength: 5, maxLength: 20 },
    doctorName: { minLength: 2, maxLength: 100 },
    license: { minLength: 5, maxLength: 20 },
    quantity: { min: 1, max: 1000 },
  },
} as const

// Error codes
export const ERROR_CODES = {
  // Validation errors
  VALIDATION_FAILED: "VALIDATION_FAILED",
  REQUIRED_FIELD_MISSING: "REQUIRED_FIELD_MISSING",
  INVALID_FORMAT: "INVALID_FORMAT",
  DUPLICATE_ENTRY: "DUPLICATE_ENTRY",

  // Business logic errors
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  EXPIRED_PRESCRIPTION: "EXPIRED_PRESCRIPTION",
  UNAUTHORIZED_ACCESS: "UNAUTHORIZED_ACCESS",
  INVALID_OPERATION: "INVALID_OPERATION",

  // System errors
  DATABASE_ERROR: "DATABASE_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const

// Success messages
export const SUCCESS_MESSAGES = {
  medicine: {
    created: "Medicine added successfully",
    updated: "Medicine updated successfully",
    deleted: "Medicine deleted successfully",
  },
  customer: {
    created: "Customer added successfully",
    updated: "Customer updated successfully",
    deleted: "Customer deleted successfully",
  },
  prescription: {
    created: "Prescription created successfully",
    updated: "Prescription updated successfully",
    filled: "Prescription filled successfully",
  },
  sale: {
    completed: "Sale completed successfully",
    refunded: "Sale refunded successfully",
  },
} as const

// Local storage keys
export const STORAGE_KEYS = {
  user: "pharmacy_user",
  preferences: "pharmacy_preferences",
  cart: "pharmacy_cart",
  recentSearches: "pharmacy_recent_searches",
  theme: "pharmacy_theme",
} as const

// Date formats
export const DATE_FORMATS = {
  display: "MMM dd, yyyy",
  input: "yyyy-MM-dd",
  timestamp: "yyyy-MM-dd HH:mm:ss",
  filename: "yyyyMMdd_HHmmss",
} as const
