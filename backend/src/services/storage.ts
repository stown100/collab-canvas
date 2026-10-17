import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

// S3-compatible object storage (MinIO) for board asset bytes. The bucket stays
// internal — only the backend talks to it; clients reach files via the proxy.

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    const endpoint = process.env.MINIO_ENDPOINT;
    if (!endpoint) throw new Error('MINIO_ENDPOINT is not defined');
    _client = new S3Client({
      endpoint,
      region: process.env.MINIO_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || '',
        secretAccessKey: process.env.MINIO_SECRET_KEY || '',
      },
      forcePathStyle: true, // MinIO requires path-style addressing
    });
  }
  return _client;
}

function bucket(): string {
  return process.env.MINIO_BUCKET || 'board-assets';
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObjectStream(key: string): Promise<Readable> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return res.Body as Readable;
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
