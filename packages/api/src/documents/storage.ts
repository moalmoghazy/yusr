/**
 * Object storage for case documents (Cloudflare R2 or S3 — same API).
 *  - private bucket: originals (IDs, medical reports). Only short-lived signed links.
 *  - public bucket: redacted copies shown on case pages.
 * Clients upload straight to storage with a presigned PUT; the API never proxies files.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type Bucket = 'private' | 'public';

export interface PresignedUpload {
  url: string;
  /** Headers the client must send with the PUT (content type, length, checksum). */
  headers: Record<string, string>;
}

export interface ObjectStorage {
  presignPut(input: { bucket: Bucket; key: string; contentType: string; sizeBytes: number; expiresInSeconds: number }): Promise<PresignedUpload>;
  presignGet(input: { bucket: Bucket; key: string; expiresInSeconds: number }): Promise<string>;
  publicUrl(key: string): string;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/**
 * For local development, tests and the demo: presigned-style links served by the API itself
 * (/dev-storage/...), signed and expiring like real ones, with the bytes kept in memory
 * (oldest evicted beyond the cap). Never used when object storage is configured.
 */
export class DevStorage implements ObjectStorage {
  private readonly objects = new Map<string, { contentType: string; body: Buffer }>();
  private size = 0;
  private readonly secret = randomBytes(32);

  constructor(
    private readonly baseUrl: string,
    private readonly options: { maxBytes?: number; now?: () => number } = {},
  ) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  private sign(method: 'PUT' | 'GET', bucket: Bucket, key: string, expires: number): string {
    return createHmac('sha256', this.secret).update(`${method}\n${bucket}\n${key}\n${expires}`).digest('hex').slice(0, 40);
  }

  private link(method: 'PUT' | 'GET', bucket: Bucket, key: string, expiresInSeconds: number): string {
    const expires = Math.floor(this.now() / 1000) + expiresInSeconds;
    return `${this.baseUrl.replace(/\/$/, '')}/dev-storage/${bucket}/${key}?expires=${expires}&sig=${this.sign(method, bucket, key, expires)}`;
  }

  async presignPut(input: { bucket: Bucket; key: string; contentType: string; sizeBytes: number; expiresInSeconds: number }) {
    return {
      url: this.link('PUT', input.bucket, input.key, input.expiresInSeconds),
      headers: { 'content-type': input.contentType, 'content-length': String(input.sizeBytes) },
    };
  }

  async presignGet(input: { bucket: Bucket; key: string; expiresInSeconds: number }) {
    return this.link('GET', input.bucket, input.key, input.expiresInSeconds);
  }

  publicUrl(key: string) {
    return `${this.baseUrl.replace(/\/$/, '')}/dev-storage/public/${key}`;
  }

  /** Checks a link made by presignPut/presignGet (public objects need no signature to read). */
  verify(method: 'PUT' | 'GET', bucket: Bucket, key: string, query: { expires?: string; sig?: string }): boolean {
    if (method === 'GET' && bucket === 'public') return true;
    const expires = Number(query.expires);
    if (!Number.isInteger(expires) || expires * 1000 < this.now() || typeof query.sig !== 'string') return false;
    const expected = Buffer.from(this.sign(method, bucket, key, expires));
    const given = Buffer.from(query.sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  put(bucket: Bucket, key: string, contentType: string, body: Buffer): void {
    const id = `${bucket}/${key}`;
    const previous = this.objects.get(id);
    if (previous) this.size -= previous.body.length;
    this.objects.set(id, { contentType, body });
    this.size += body.length;
    const max = this.options.maxBytes ?? 64 * 1024 * 1024;
    for (const [oldest, object] of this.objects) {
      if (this.size <= max) break;
      this.objects.delete(oldest);
      this.size -= object.body.length;
    }
  }

  get(bucket: Bucket, key: string): { contentType: string; body: Buffer } | null {
    return this.objects.get(`${bucket}/${key}`) ?? null;
  }
}
