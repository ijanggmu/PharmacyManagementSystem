/**
 * Encryption utilities for PHI (Protected Health Information)
 * HIPAA-compliant encryption for sensitive data at rest
 */

import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const TAG_LENGTH = 16
const KEY_LENGTH = 32

/**
 * Get encryption key from environment variable
 * In production, use a proper key management service (AWS KMS, HashiCorp Vault, etc.)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required for PHI encryption")
  }

  // If key is a hex string, convert it; otherwise use it directly
  if (key.length === 64) {
    return Buffer.from(key, "hex")
  }

  // Derive a 32-byte key from the provided key using PBKDF2
  return crypto.pbkdf2Sync(key, "pharmacy-phi-salt", 100000, KEY_LENGTH, "sha512")
}

/**
 * Encrypt sensitive PHI data
 * Uses AES-256-GCM for authenticated encryption
 */
export function encryptSensitiveData(data: string): string {
  try {
    if (!data) {
      return data
    }

    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(data, "utf8", "hex")
    encrypted += cipher.final("hex")
    const tag = cipher.getAuthTag()

    // Combine IV, tag, and encrypted data
    const result = iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted

    return result
  } catch (error) {
    console.error("Encryption error:", error)
    throw new Error("Failed to encrypt sensitive data")
  }
}

/**
 * Decrypt sensitive PHI data
 */
export function decryptSensitiveData(encryptedData: string): string {
  try {
    if (!encryptedData) {
      return encryptedData
    }

    // Check if data is already decrypted (not in encrypted format)
    if (!encryptedData.includes(":")) {
      return encryptedData
    }

    const parts = encryptedData.split(":")
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format")
    }

    const key = getEncryptionKey()
    const iv = Buffer.from(parts[0], "hex")
    const tag = Buffer.from(parts[1], "hex")
    const encrypted = parts[2]

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)

    let decrypted = decipher.update(encrypted, "hex", "utf8")
    decrypted += decipher.final("utf8")

    return decrypted
  } catch (error) {
    console.error("Decryption error:", error)
    throw new Error("Failed to decrypt sensitive data")
  }
}

/**
 * Hash PHI data for searching (one-way hash, cannot be decrypted)
 * Used for fields that need to be searchable but remain encrypted
 */
export function hashPHIData(data: string): string {
  if (!data) {
    return ""
  }

  const salt = process.env.HASH_SALT || "pharmacy-phi-hash-salt"
  return crypto
    .createHash("sha256")
    .update(data + salt)
    .digest("hex")
}

/**
 * Check if a field contains PHI and should be encrypted
 */
export function isPHIField(tableName: string, fieldName: string): boolean {
  const PHI_FIELDS: Record<string, string[]> = {
    customers: ["first_name", "last_name", "email", "phone", "address", "date_of_birth", "insurance_info"],
    prescriptions: ["doctor_name", "doctor_license", "notes"],
    prescription_items: ["dosage_instructions"],
    sales: ["notes"],
    sale_items: [],
  }

  return PHI_FIELDS[tableName]?.includes(fieldName) || false
}
