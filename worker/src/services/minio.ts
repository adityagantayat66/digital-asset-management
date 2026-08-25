import * as Minio from 'minio'
import { env } from '../config/env'
import path from 'path';
import fs from 'fs';

const minioClient = new Minio.Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    region: 'us-east-1',
    accessKey: env.MINIO_ROOT_USER,
    secretKey: env.MINIO_ROOT_PASSWORD,
    useSSL: false,
})

export async function assertBucketExists(bucketName: string) {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
        await minioClient.makeBucket(bucketName, 'us-east-1');
    }
}

export async function downloadRawAssets(rawPath: string, localPath: string) {
    if (!rawPath.length || !localPath.length) {
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
        await minioClient.fGetObject(env.MINIO_RAW_BUCKET, objectKey, localPath);
        console.log('Asset downloaded successfully');
    } catch (error) {
        throw new Error(`Failed to download raw asset from MinIO: ${error}`);
    }
}

export async function uploadProcessedAsset(fileKey: string, filePath: string, contentType: string = 'image/jpeg') {
    if (!fileKey.length || !filePath.length) {
        throw new Error('Invalid fileKey or filePath');
    }
    await assertBucketExists(env.MINIO_PROCESSED_BUCKET);
    try {
        await minioClient.fPutObject(env.MINIO_PROCESSED_BUCKET, fileKey, filePath, { 'Content-Type': contentType });
        console.log(`Uploaded processed asset ${fileKey} from ${filePath}`);
        return `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${env.MINIO_PROCESSED_BUCKET}/${fileKey}`
    } catch (error) {
        throw new Error(`Failed to upload processed asset to MinIO: ${error}`);
    }
}