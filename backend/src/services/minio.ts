import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

// 1. Initialize S3 Client targeting our local MinIO instance
export const s3Client = new S3Client({
  endpoint: `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true, // Crucial for MinIO path-style bucket URLs (http://localhost:9000/bucket/key)
});

/**
 * Generates a temporary Presigned PUT URL.
 * Allows browser clients to upload files DIRECTLY to MinIO raw-assets bucket
 * without overloading the API Gateway memory or bandwidth.
 */
export async function generatePresignedUploadUrl(
  fileKey: string,
  contentType: string,
  expiresInSeconds = 900 // Link expires in 15 minutes
): Promise<{ uploadUrl: string; rawPath: string }> {
  const command = new PutObjectCommand({
    Bucket: env.MINIO_RAW_BUCKET,
    Key: fileKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  const rawPath = `${env.MINIO_RAW_BUCKET}/${fileKey}`;

  return { uploadUrl, rawPath };
}

/**
 * Generates a temporary Presigned GET URL for downloading/streaming assets securely.
 */
export async function generatePresignedDownloadUrl(
  bucket: string,
  fileKey: string,
  expiresInSeconds = 3600 // Link expires in 1 hour
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: fileKey,
  });

  return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Constructs a direct static public URL for assets in public-read buckets (like thumbnails).
 * Avoids presigned URL generation overhead for thousands of gallery cards.
 */
export function getPublicAssetUrl(bucket: string, fileKey: string): string {
  if (!fileKey) return '';
  if (fileKey.startsWith('http')) return fileKey;
  return `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${bucket}/${fileKey}`;
}

/**
 * Deletes an object from a specified MinIO S3 bucket.
 */
export async function deleteS3Object(bucket: string, fileKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: fileKey,
  });
  await s3Client.send(command);
}


