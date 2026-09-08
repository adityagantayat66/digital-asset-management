import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { LoggerService } from './logger';

export const s3Client = new S3Client({
  endpoint: `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true,
});

export async function assertBucketExists(bucketName: string) {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
  } catch {
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
    } catch (err) {
      console.warn(`MinIO bucket creation notice for "${bucketName}":`, err);
    }
  }
}

export async function downloadRawAssets(rawPath: string, localPath: string) {
  if (!rawPath.length || !localPath.length) {
    LoggerService.logError({
      level: 'CRITICAL',
      functionName: 'Worker:MinIO',
      message: 'Invalid rawPath or localPath',
      details: { rawPath, localPath },
    });
    throw new Error('Invalid rawPath or localPath');
  }
  await assertBucketExists(env.MINIO_RAW_BUCKET);
  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const objectKey = rawPath.startsWith(`${env.MINIO_RAW_BUCKET}/`)
    ? rawPath.replace(`${env.MINIO_RAW_BUCKET}/`, '')
    : rawPath;
  console.log(`Downloading ${rawPath} to ${localPath}`);
  try {
    const command = new GetObjectCommand({
      Bucket: env.MINIO_RAW_BUCKET,
      Key: objectKey,
    });
    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new Error(`Empty response body for object ${objectKey}`);
    }
    await pipeline(response.Body as Readable, fs.createWriteStream(localPath));
    console.log('Asset downloaded successfully');
  } catch (error: any) {
    LoggerService.logError({
      level: 'CRITICAL',
      functionName: 'Worker:MinIO',
      message: typeof error === 'string' ? error : (error?.message || 'Failed to download raw asset from MinIO'),
      stack: error?.stack,
      details: { rawPath, localPath },
    });
    throw new Error(`Failed to download raw asset from MinIO: ${error?.message || error}`);
  }
}

export async function uploadProcessedAsset(fileKey: string, filePath: string, contentType: string = 'image/jpeg') {
  if (!fileKey.length || !filePath.length) {
    LoggerService.logError({
      level: 'CRITICAL',
      functionName: 'Worker:MinIO',
      message: 'Invalid fileKey or filePath',
      details: { fileKey, filePath, contentType },
    });
    throw new Error('Invalid fileKey or filePath');
  }
  await assertBucketExists(env.MINIO_PROCESSED_BUCKET);
  try {
    const fileStream = fs.createReadStream(filePath);
    const command = new PutObjectCommand({
      Bucket: env.MINIO_PROCESSED_BUCKET,
      Key: fileKey,
      Body: fileStream,
      ContentType: contentType,
    });
    await s3Client.send(command);
    console.log(`Uploaded processed asset ${fileKey} from ${filePath}`);
    return fileKey;
  } catch (error: any) {
    LoggerService.logError({
      level: 'CRITICAL',
      functionName: 'Worker:MinIO',
      message: typeof error === 'string' ? error : (error?.message || 'Failed to upload processed asset to MinIO'),
      stack: error?.stack,
      details: { fileKey, filePath, contentType },
    });
    throw new Error(`Failed to upload processed asset to MinIO: ${error?.message || error}`);
  }
}

export async function deleteRawAsset(rawPath: string): Promise<void> {
  if (!rawPath) return;
  const objectKey = rawPath.startsWith(`${env.MINIO_RAW_BUCKET}/`)
    ? rawPath.replace(`${env.MINIO_RAW_BUCKET}/`, '')
    : rawPath;
  try {
    const command = new DeleteObjectCommand({
      Bucket: env.MINIO_RAW_BUCKET,
      Key: objectKey,
    });
    await s3Client.send(command);
    console.log(`Deleted raw asset object "${objectKey}" from MinIO bucket "${env.MINIO_RAW_BUCKET}"`);
  } catch (error: any) {
    LoggerService.logError({
      level: 'CRITICAL',
      functionName: 'Worker:MinIO',
      message: typeof error === 'string' ? error : (error?.message || 'Failed to delete raw asset from MinIO'),
      stack: error?.stack,
      details: { objectKey },
    });
    console.warn(`Notice: Could not remove object "${objectKey}" from MinIO:`, error);
  }
}