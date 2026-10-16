import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for personal data at rest (national IDs, phone numbers of beneficiaries,
 * staff authenticator secrets). Layout: version(1) | iv(12) | tag(16) | ciphertext.
 * In production the 32-byte data key comes from a KMS (envelope encryption) and is
 * only held in memory.
 */
export class FieldCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) throw new Error('Data key must be 32 bytes (base64)');
  }

  static randomKey(): string {
    return randomBytes(32).toString('base64');
  }

  encrypt(plain: string, associatedData = ''): Uint8Array {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    if (associatedData) cipher.setAAD(Buffer.from(associatedData));
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), body]);
  }

  decrypt(sealed: Uint8Array, associatedData = ''): string {
    const data = Buffer.from(sealed);
    if (data[0] !== 1 || data.length < 29) throw new Error('Unknown ciphertext format');
    const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(1, 13));
    decipher.setAuthTag(data.subarray(13, 29));
    if (associatedData) decipher.setAAD(Buffer.from(associatedData));
    return Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]).toString('utf8');
  }
}

export const FIELD_CIPHER = Symbol('FIELD_CIPHER');
