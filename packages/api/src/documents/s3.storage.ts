import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Bucket, ObjectStorage, PresignedUpload } from './storage';

export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  buckets: Record<Bucket, string>;
  /** CDN in front of the public bucket, e.g. https://files.yusr.example */
  publicBaseUrl: string;
}

export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: true,
    });
  }

  async presignPut(input: { bucket: Bucket; key: string; contentType: string; sizeBytes: number; expiresInSeconds: number }): Promise<PresignedUpload> {
    // Encryption at rest is the bucket's default (S3 encrypts every new object with SSE-S3, R2 always
    // encrypts), so the browser's PUT carries no extra x-amz-* headers that would have to be signed.
    const command = new PutObjectCommand({
      Bucket: this.config.buckets[input.bucket],
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
    return { url, headers: { 'content-type': input.contentType, 'content-length': String(input.sizeBytes) } };
  }

  presignGet(input: { bucket: Bucket; key: string; expiresInSeconds: number }): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.config.buckets[input.bucket], Key: input.key });
    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
  }

  publicUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }
}
