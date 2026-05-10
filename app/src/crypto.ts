/**
 * API Key Encryption — Web Crypto API (AES-GCM + PBKDF2)
 *
 * Encrypts API key strings with a user-supplied master password so they are
 * never stored in plaintext on disk.  Encrypted blobs are written to
 * `app_settings.secrets.json` alongside the unencrypted `app_settings.json`.
 *
 * Format:  PBKDF2 derives a 256-bit AES key from (password + random salt).
 *          AES-GCM encrypts the plaintext with a random 12-byte IV.
 *          Salt, IV, ciphertext are all base64-encoded.
 */

/** Result of encryptApiKey — all fields are base64 strings. */
export interface EncryptedBlob {
  /** AES-GCM ciphertext (base64) */
  encrypted: string;
  /** Initialisation vector, 12 bytes (base64) */
  iv: string;
  /** PBKDF2 salt, 16 bytes (base64) */
  salt: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes — recommended for GCM
const SALT_LENGTH = 16; // bytes
const PBKDF2_ITERATIONS = 210_000; // OWASP 2025 recommendation
const PBKDF2_HASH = "SHA-256";

// ── Helpers ───────────────────────────────────────────────────────────

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── Key derivation ────────────────────────────────────────────────────

/**
 * Derive a 256-bit AES key from a password and salt using PBKDF2.
 */
async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Encrypt an API key string with a master password.
 * Returns the encrypted blob (all base64).
 */
export async function encryptApiKey(
  plaintext: string,
  password: string,
): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    enc.encode(plaintext),
  );

  return {
    encrypted: bufToBase64(ciphertext),
    iv: bufToBase64(iv.buffer),
    salt: bufToBase64(salt.buffer),
  };
}

/**
 * Decrypt an encrypted blob back to the original API key string.
 * Returns null if decryption fails (wrong password or corrupted data).
 */
export async function decryptApiKey(
  blob: EncryptedBlob,
  password: string,
): Promise<string | null> {
  try {
    const salt = new Uint8Array(base64ToBuf(blob.salt));
    const iv = new Uint8Array(base64ToBuf(blob.iv));
    const ciphertext = base64ToBuf(blob.encrypted);
    const key = await deriveKey(password, salt);

    const plainBuf = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext,
    );

    return new TextDecoder().decode(plainBuf);
  } catch {
    return null; // wrong password or corrupted data
  }
}

/**
 * Encrypt a whole batch of named API keys with a single password.
 * Returns a record keyed by name, each value being an EncryptedBlob.
 */
export async function encryptApiKeyBatch(
  keys: Record<string, string>,
  password: string,
): Promise<Record<string, EncryptedBlob>> {
  const result: Record<string, EncryptedBlob> = {};
  for (const [name, value] of Object.entries(keys)) {
    if (value) {
      result[name] = await encryptApiKey(value, password);
    }
  }
  return result;
}

/**
 * Decrypt a batch of encrypted blobs, returning a record of plaintext keys.
 * If any blob fails to decrypt, that entry is skipped (null).
 */
export async function decryptApiKeyBatch(
  blobs: Record<string, EncryptedBlob>,
  password: string,
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const [name, blob] of Object.entries(blobs)) {
    result[name] = await decryptApiKey(blob, password);
  }
  return result;
}
