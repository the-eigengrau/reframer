import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedPayload {
  ciphertext: string;  // base64
  iv: string;          // hex
  authTag: string;     // hex
}

export function deriveKey(passphrase: string, salt: string, iterations: number): Buffer {
  return crypto.pbkdf2Sync(passphrase, Buffer.from(salt, 'hex'), iterations, KEY_LENGTH, 'sha512');
}

export function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

export function decrypt(payload: EncryptedPayload, key: Buffer): string {
  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(payload.ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

export function encryptJSON(data: unknown, key: Buffer): EncryptedPayload {
  return encrypt(JSON.stringify(data), key);
}

export function decryptJSON<T>(payload: EncryptedPayload, key: Buffer): T {
  return JSON.parse(decrypt(payload, key)) as T;
}

/** Create a sentinel value to verify passphrase on subsequent launches */
export function createSentinel(key: Buffer): EncryptedPayload {
  return encrypt('reframer-sentinel-v1', key);
}

/** Verify a passphrase by attempting to decrypt the sentinel */
export function verifySentinel(payload: EncryptedPayload, key: Buffer): boolean {
  try {
    const result = decrypt(payload, key);
    return result === 'reframer-sentinel-v1';
  } catch {
    return false;
  }
}
