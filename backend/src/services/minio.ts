import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

// 1. Internal S3 Client for backend container-to-container operations (http://minio:9000)
export const internalS3Client = new S3Client({
  endpoint: `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true,
});

// 2. Client for generating browser-facing presigned URLs (e.g. http://localhost:9000)
export const presignedS3Client = new S3Client({
  endpoint: env.MINIO_PUBLIC_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true,
});

/**
 * @Description Ensures required S3 buckets exist, configures CORS, and sets public-read policy for processed assets (thumbnails).
 * @Returns Promise<void>
 */
export async function ensureMinioBucketsExist(): Promise<void> {
  const buckets = [env.MINIO_RAW_BUCKET, env.MINIO_PROCESSED_BUCKET];
  for (const bucket of buckets) {
    try {
      await internalS3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      try {
        await internalS3Client.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`✅ Created MinIO Bucket: "${bucket}"`);
      } catch (err) {
        console.warn(`MinIO bucket creation notice for "${bucket}":`, err);
      }
    }
  }

  try {
    for (const bucket of buckets) {
      await internalS3Client.send(new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['Content-Type', 'Authorization', 'x-amz-*', 'x-requested-with', 'accept', 'origin'],
              AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
              AllowedOrigins: env.FRONTEND_URLS,
              ExposeHeaders: ['ETag'],
            },
          ],
        },
      }));
    }

    // Set public read policy on processed-assets bucket for direct <img> tag rendering
    const publicPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${env.MINIO_PROCESSED_BUCKET}/*`],
        },
      ],
    };

    await internalS3Client.send(new PutBucketPolicyCommand({
      Bucket: env.MINIO_PROCESSED_BUCKET,
      Policy: JSON.stringify(publicPolicy),
    }));
    console.log(`✅ Configured CORS & Public Read Policy for MinIO buckets.`);
  } catch (err) {
    console.warn('⚠️ MinIO bucket policy setup notice:', err);
  }
}

/**
 * @Description Generates a temporary Presigned PUT URL allowing browser clients to upload files DIRECTLY to MinIO raw-assets bucket.
 * @Params fileKey (string) - Unique object file key
 *         contentType (string) - MIME content type header
 *         expiresInSeconds (number) - Expiration timeout in seconds (default: 900)
 * @Returns Promise<{ uploadUrl: string; rawPath: string }> - Presigned upload URL and raw asset path
 */
export async function generatePresignedUploadUrl(
  fileKey: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<{ uploadUrl: string; rawPath: string }> {
  const command = new PutObjectCommand({
    Bucket: env.MINIO_RAW_BUCKET,
    Key: fileKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(presignedS3Client, command, { expiresIn: expiresInSeconds });
  const rawPath = `${env.MINIO_RAW_BUCKET}/${fileKey}`;

  return { uploadUrl, rawPath };
}

/**
 * @Description Generates a temporary Presigned GET URL for downloading or streaming assets securely.
 * @Params bucket (string) - MinIO S3 bucket name
 *         fileKey (string) - Target file object key
 *         expiresInSeconds (number) - Expiration duration in seconds (default: 3600)
 * @Returns Promise<string> - Signed GET download URL
 */
export async function generatePresignedDownloadUrl(
  bucket: string,
  fileKey: string,
  expiresInSeconds = 3600
): Promise<string> {
  if (!fileKey) return '';
  let cleanKey = fileKey.replace(/^https?:\/\/[^\/]+/, '');
  cleanKey = cleanKey.replace(/^\/?minio\//, '/');
  cleanKey = cleanKey.replace(new RegExp(`^\\/?${bucket}\\/`), '/');
  cleanKey = cleanKey.replace(/^\/+/, '');

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: cleanKey,
  });

  return await getSignedUrl(presignedS3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * @Description Constructs a direct static public URL for assets in public-read buckets (like thumbnails).
 * @Params bucket (string) - MinIO S3 bucket name
 *         fileKey (string) - Target file object key
 * @Returns string - Formatted public asset URL
 */
export function getPublicAssetUrl(bucket: string, fileKey: string): string {
  if (!fileKey) return '';
  if (fileKey.startsWith('http://') || fileKey.startsWith('https://')) {
    return fileKey.replace(/^https?:\/\/[^\/]+/, env.MINIO_PUBLIC_ENDPOINT);
  }
  const cleanKey = fileKey.replace(/^\/+/, '');
  return `${env.MINIO_PUBLIC_ENDPOINT}/${bucket}/${cleanKey}`;
}

/**
 * @Description Deletes an object from a specified MinIO S3 bucket.
 * @Params bucket (string) - Target MinIO S3 bucket
 *         fileKey (string) - Object file key to delete
 * @Returns Promise<void>
 */
export async function deleteS3Object(bucket: string, fileKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: fileKey,
  });
  await internalS3Client.send(command);
}

/**
 * @Description Copies an existing object to a new key path within or across MinIO S3 buckets.
 * @Params sourceBucket (string) - Source MinIO S3 bucket name
 *         sourceKey (string) - Source object file key
 *         targetBucket (string) - Target MinIO S3 bucket name
 *         targetKey (string) - Target object file key
 * @Returns Promise<void>
 */
export async function copyS3Object(
  sourceBucket: string,
  sourceKey: string,
  targetBucket: string,
  targetKey: string
): Promise<void> {
  const command = new CopyObjectCommand({
    Bucket: targetBucket,
    Key: targetKey,
    CopySource: `/${sourceBucket}/${sourceKey}`,
  });
  await internalS3Client.send(command);
}

