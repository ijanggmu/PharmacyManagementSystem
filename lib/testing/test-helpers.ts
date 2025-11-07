/**
 * Test Helpers - Common utilities for unit and integration tests
 */

export interface TestHelpers {
  /**
   * Mock data generators for testing
   */
  mockData: {
    customer: (overrides?: Partial<any>) => any
    medicine: (overrides?: Partial<any>) => any
    prescription: (overrides?: Partial<any>) => any
    sale: (overrides?: Partial<any>) => any
    return: (overrides?: Partial<any>) => any
    refund: (overrides?: Partial<any>) => any
  }
  /**
   * Common test setup and teardown
   */
  setup: () => Promise<void>
  teardown: () => Promise<void>
  /**
   * Assertion helpers
   */
  expect: (value: any) => any
}

/**
 * Test helpers instance with common utilities for testing
 */
export const testHelpers: TestHelpers = {
  mockData: {
    customer: (overrides = {}) => ({
      id: "1",
      first_name: "John",
      last_name: "Doe",
      phone: "+1234567890",
      email: "john@example.com",
      address: "123 Main St",
      city: "New York",
      state: "NY",
      postal_code: "10001",
      ...overrides,
    }),
    medicine: (overrides = {}) => ({
      id: "1",
      name: "Aspirin",
      strength: "500mg",
      form: "tablet",
      category_id: "1",
      unit_price: 10.0,
      quantity_in_stock: 100,
      reorder_level: 50,
      ...overrides,
    }),
    prescription: (overrides = {}) => ({
      id: "1",
      prescription_number: "RX001",
      customer_id: "1",
      doctor_name: "Dr. Smith",
      prescribed_date: new Date().toISOString(),
      status: "pending",
      notes: "Take with water",
      ...overrides,
    }),
    sale: (overrides = {}) => ({
      id: "1",
      sale_number: "SAL001",
      customer_id: "1",
      total_amount: 500.0,
      discount: 0,
      tax: 45.0,
      payment_method: "cash",
      status: "completed",
      ...overrides,
    }),
    return: (overrides = {}) => ({
      id: "1",
      return_number: "RET001",
      inventory_id: "1",
      supplier_id: "1",
      quantity_returned: 10,
      reason: "expired",
      status: "pending",
      ...overrides,
    }),
    refund: (overrides = {}) => ({
      id: "1",
      refund_number: "REF001",
      sale_id: "1",
      amount: 100.0,
      reason: "customer_request",
      status: "pending",
      ...overrides,
    }),
  },
  setup: async () => {
    // Common test setup
  },
  teardown: async () => {
    // Common test teardown
  },
  expect: (value: any) => ({
    toBe: (expected: any) => value === expected,
    toEqual: (expected: any) => JSON.stringify(value) === JSON.stringify(expected),
    toBeNull: () => value === null,
    toBeDefined: () => value !== undefined,
  }),
}
