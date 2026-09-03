import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
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

// 2. Client for generating browser-facing presigned URLs (http://localhost:9000)
export const presignedS3Client = new S3Client({
  endpoint: `http://localhost:${env.MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true,
});

/**
 * Ensures required S3 buckets exist, configures CORS, and sets public-read policy for processed assets (thumbnails).
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
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
              AllowedOrigins: ['*'],
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
 * Generates a temporary Presigned PUT URL.
 * Allows browser clients to upload files DIRECTLY to MinIO raw-assets bucket (localhost:9000)
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
 * Generates a temporary Presigned GET URL for downloading/streaming assets securely.
 */
export async function generatePresignedDownloadUrl(
  bucket: string,
  fileKey: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: fileKey,
  });

  return await getSignedUrl(presignedS3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Constructs a direct static public URL for assets in public-read buckets (like thumbnails).
 */
export function getPublicAssetUrl(bucket: string, fileKey: string): string {
  if (!fileKey) return '';
  if (fileKey.startsWith('http')) {
    return fileKey
      .replace(`http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`, `http://localhost:${env.MINIO_PORT}`)
      .replace('http://minio:9000', `http://localhost:${env.MINIO_PORT}`);
  }
  return `http://localhost:${env.MINIO_PORT}/${bucket}/${fileKey}`;
}

/**
 * Deletes an object from a specified MinIO S3 bucket.
 */
export async function deleteS3Object(bucket: string, fileKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: fileKey,
  });
  await internalS3Client.send(command);
}
