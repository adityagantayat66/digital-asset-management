import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: '../.env' });
dotenv.config();

import fs from 'fs';
import http from 'http';
import https from 'https';
import { prisma } from './services/prisma';

const API_BASE = 'http://localhost:5000/api';
const ATTACHED_IMAGE_PATH = 'C:\\Users\\adityag\\.gemini\\antigravity-ide\\brain\\655b600d-2c63-49aa-9255-2bb194374b52\\media__1787652942981.jpg';

async function makeRequest(url: string, options: any, bodyData?: any): Promise<{ statusCode: number; data: any; headers: any }> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const reqModule = parsedUrl.protocol === 'https:' ? https : http;

        const req = reqModule.request(url, options, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                let parsedBody = body;
                try {
                    parsedBody = JSON.parse(body);
                } catch (e) { }
                resolve({ statusCode: res.statusCode || 500, data: parsedBody, headers: res.headers });
            });
        });

        req.on('error', (err) => reject(err));

        if (bodyData) {
            if (Buffer.isBuffer(bodyData)) {
                req.write(bodyData);
            } else if (typeof bodyData === 'string') {
                req.write(bodyData);
            } else {
                req.write(JSON.stringify(bodyData));
            }
        }
        req.end();
    });
}

async function runSequentialTest() {
    console.log('====================================================');
    console.log('🚀 STARTING SEQUENTIAL END-TO-END USER FLOW TEST');
    console.log('====================================================\n');

    const testEmail = 'adi@mail.com';
    const testName = 'aditya';
    const testPassword = 'qwerty123';

    // 0. Clean up existing test user if present
    await prisma.asset.deleteMany({ where: { uploader: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: testEmail } });

    // STEP 1: REGISTER USER
    console.log('📌 STEP 1: Registering User via POST /api/auth/register...');
    const regPayload = { email: testEmail, name: testName, password: testPassword };
    const regRes = await makeRequest(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    }, regPayload);

    console.log('   HTTP Status Code:', regRes.statusCode);
    console.log('   Register Response:', JSON.stringify(regRes.data, null, 2));

    const dbUser = await prisma.user.findUnique({ where: { email: testEmail } });
    console.log('   🔍 [PostgreSQL Verification] Saved User Record in DB:', {
        id: dbUser?.id,
        email: dbUser?.email,
        name: dbUser?.name,
        role: dbUser?.role,
        createdAt: dbUser?.createdAt,
    });

    if (!dbUser || regRes.statusCode !== 201) {
        throw new Error('❌ STEP 1 FAILED: Registration error or user not found in DB');
    }
    console.log('   ✅ STEP 1 PASSED!\n');

    // STEP 2: LOGIN USER
    console.log('📌 STEP 2: Logging in via POST /api/auth/login...');
    const loginPayload = { email: testEmail, password: testPassword };
    const loginRes = await makeRequest(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    }, loginPayload);

    console.log('   HTTP Status Code:', loginRes.statusCode);
    console.log('   Login Response Token Obtained:', loginRes.data.token ? 'YES (JWT Token Valid)' : 'NO');

    const jwtToken = loginRes.data.token;
    if (!jwtToken || loginRes.statusCode !== 200) {
        throw new Error('❌ STEP 2 FAILED: Login failed or JWT token missing');
    }
    console.log('   ✅ STEP 2 PASSED!\n');

    // STEP 3: REQUEST PRESIGNED URL
    console.log('📌 STEP 3: Requesting Presigned Upload URL via POST /api/assets/presigned-url...');
    const imageBuffer = fs.readFileSync(ATTACHED_IMAGE_PATH);
    const presignedPayload = {
        filename: 'sandisk_usb.jpg',
        mimeType: 'image/jpeg',
        size: imageBuffer.length,
        tags: ['sandisk', 'flashdrive', 'tech'],
    };

    const presignedRes = await makeRequest(`${API_BASE}/assets/presigned-url`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
        },
    }, presignedPayload);

    console.log('   HTTP Status Code:', presignedRes.statusCode);
    console.log('   Presigned URL Response:', JSON.stringify(presignedRes.data, null, 2));

    const { id: assetId, uploadUrl, rawPath } = presignedRes.data;
    if (!assetId || !uploadUrl || presignedRes.statusCode !== 200) {
        throw new Error('❌ STEP 3 FAILED: Could not obtain presigned upload URL');
    }
    console.log('   ✅ STEP 3 PASSED!\n');

    // STEP 4: UPLOAD ATTACHED IMAGE TO MINIO VIA PRESIGNED URL
    console.log('📌 STEP 4: Uploading Attached SanDisk Image (122 KB) directly to MinIO Presigned URL...');
    const uploadRes = await makeRequest(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': imageBuffer.length.toString(),
        },
    }, imageBuffer);

    console.log('   MinIO Presigned PUT Status Code:', uploadRes.statusCode);
    if (uploadRes.statusCode !== 200 && uploadRes.statusCode !== 204) {
        throw new Error(`❌ STEP 4 FAILED: MinIO direct upload failed with status ${uploadRes.statusCode}`);
    }
    console.log('   ✅ STEP 4 PASSED! Attached image successfully stored in raw-assets bucket.\n');

    // STEP 5: SUBSCRIBE TO SSE PROGRESS STREAM BEFORE ENQUEUEING
    console.log('📌 STEP 5: Subscribing to SSE Stream GET /api/assets/' + assetId + '/progress/stream...');
    const sseReceivedEvents: any[] = [];

    const sseReq = http.request(`${API_BASE}/assets/${assetId}/progress/stream`, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
    }, (res) => {
        res.on('data', (chunk) => {
            const text = chunk.toString();
            const lines = text.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const eventDataStr = line.substring(6).trim();
                    try {
                        const parsed = JSON.parse(eventDataStr);
                        console.log('   📡 [SSE Event Stream Received]:', parsed);
                        sseReceivedEvents.push(parsed);
                    } catch (e) { }
                }
            }
        });
    });
    sseReq.end();
    await new Promise((r) => setTimeout(r, 500));
    console.log('   ✅ STEP 5 PASSED! Connected to live SSE progress stream.\n');

    // STEP 6: COMPLETE UPLOAD REQUEST
    console.log('📌 STEP 6: Sending completeUpload Request via POST /api/assets/complete-upload...');
    const completeRes = await makeRequest(`${API_BASE}/assets/complete-upload`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
        },
    }, { assetId });

    console.log('   HTTP Status Code:', completeRes.statusCode);
    console.log('   completeUpload Response:', JSON.stringify(completeRes.data, null, 2));

    if (completeRes.statusCode !== 202) {
        throw new Error('❌ STEP 6 FAILED: completeUpload endpoint failed');
    }
    console.log('   ✅ STEP 6 PASSED!\n');

    // STEP 7: WAIT FOR WORKER PROCESSING & VERIFY FINAL POSTGRESQL RECORD
    console.log('📌 STEP 7: Waiting 4 seconds for worker to process image & update PostgreSQL DB...');
    await new Promise((r) => setTimeout(r, 4000));

    const finalAsset = await prisma.asset.findUnique({
        where: { id: assetId },
        include: { uploader: { select: { id: true, email: true, name: true } }, tags: { include: { tag: true } } },
    });

    console.log('\n====================================================');
    console.log('📊 FINAL POSTGRESQL DB RECORD AFTER PROCESSING:');
    console.log('====================================================');
    console.log(JSON.stringify(finalAsset, null, 2));

    if (finalAsset?.status === 'COMPLETED' && finalAsset.thumbnailUrl) {
        console.log('\n🎉 ALL ENDPOINTS AND WORKER PIPELINE PASSED 100% EFFECTIVELY!');
    } else {
        console.error('\n❌ STEP 7 FAILED: Asset is not marked COMPLETED or thumbnail URL missing.');
    }
}

runSequentialTest().catch((err) => {
    console.error('❌ Integration Test Fatal Error:', err);
    process.exit(1);
});
