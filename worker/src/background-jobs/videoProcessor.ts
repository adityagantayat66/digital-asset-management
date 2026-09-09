import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { JobProgressPayload, publishJobProgress } from "../services/redis";
import { LoggerService } from "../services/logger";

const FFMPEG_PATH = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const FFPROBE_PATH = process.env.FFPROBE_PATH || ffprobeStatic.path || "ffprobe";

export interface VideoMetadata {
    duration: number; // in seconds
    width: number;
    height: number;
}

/**
 * @Description Orchestrates video metadata probing, thumbnail extraction, resolution detection, and multi-profile transcoding.
 * @Params localFilePath (string) - Local path to input video file
 *         localDir (string) - Local temporary working directory
 *         assetId (string) - Asset UUID identifier
 * @Returns Promise<{ thumbnailPath: string; videoUrls: Record<string, string | null> }> - Output file paths map
 */
export const processVideo = async (localFilePath: string, localDir: string, assetId: string) => {
    if (!fs.existsSync(localFilePath)) {
        throw new Error(`Video file not found at ${localFilePath}`);
    }
    if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
    }
    try {
        const metadata = await getVideoMetadata(localFilePath);
        const thumbnailPath = path.join(localDir, 'thumbnail.jpg');
        const seekTime = Math.min(2, Math.max(0.5, Math.floor(metadata.duration * 0.2))).toString();
        await extractVideoThumbnail(localFilePath, seekTime, thumbnailPath);
        // Check if video is >= 1080p and transcode to 1080p and 720p
        if (metadata.height >= 1080) {
            const path1080 = path.join(localDir, 'video_1080p.mp4');
            const path720 = path.join(localDir, 'video_720p.mp4');
            await transcodeVideo(localFilePath, path1080, '1080p', metadata.duration, assetId);
            await transcodeVideo(localFilePath, path720, '720p', metadata.duration, assetId);
            return { thumbnailPath, videoUrls: { '1080p': path1080, '720p': path720, 'sd': null } };
        }
        // Check if video is >= 720p and transcode to 720p
        else if (metadata.height >= 720) {
            const path720 = path.join(localDir, 'video_720p.mp4');
            await transcodeVideo(localFilePath, path720, '720p', metadata.duration, assetId);
            return { thumbnailPath, videoUrls: { '1080p': null, '720p': path720, 'sd': null } };
        }
        // Video is under 720p -> Transcode to SD (standard definition)
        else {
            const pathSd = path.join(localDir, 'video_sd.mp4');
            await transcodeVideo(localFilePath, pathSd, 'standard', metadata.duration, assetId);
            return { thumbnailPath, videoUrls: { '1080p': null, '720p': null, 'sd': pathSd } };
        }

    }
    catch (error) {
        console.error(`Error processing video: ${error}`);
        LoggerService.logError({
            level: 'CRITICAL',
            functionName: 'Worker:VideoProcessor',
            message: typeof error == 'string' ? error : JSON.stringify(error),
            details: { abstractMsg: `Error processing video: ${error}` }
        })
        throw error;
    }
}

/**
 * @Description Probes input video file duration, width, and height using FFprobe.
 * @Params inputPath (string) - Path to input video file on disk
 * @Returns Promise<VideoMetadata> - Object containing duration, width, and height
 */
async function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
        const args = [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            inputPath
        ];
        const child = spawn(FFPROBE_PATH, args);

        let stdoutData = '';
        let stderrData = '';

        child.stdout.on('data', (data) => {
            stdoutData += data;
        });

        child.stderr.on('data', (data) => {
            stderrData += data;
        });

        child.on('error', (error) => {
            reject(new Error(`FFprobe failed: ${error.message}`));
        });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`FFprobe exited with code ${code}: ${stderrData}`));
            }
            try {
                const parsed = JSON.parse(stdoutData);
                const format = parsed.format;
                const videoStream = parsed.streams.find((stream: any) => stream.codec_type === "video");
                resolve({
                    duration: parseFloat(format.duration || '0'),
                    width: videoStream?.width || 0,
                    height: videoStream?.height || 0,
                })
            } catch (parseError) {
                LoggerService.logError({
                    level: 'CRITICAL',
                    functionName: 'Worker:VideoProcessor',
                    message: typeof parseError == 'string' ? parseError : JSON.stringify(parseError),
                    details: { abstractMsg: `Failed to parse FFprobe output: ${parseError}` }
                })
                reject(new Error(`Failed to parse FFprobe output: ${parseError}`));
            }
        });
    })
}
/**
 * @Description Extracts a single frame image thumbnail from video stream using FFmpeg.
 * @Params inputPath (string) - Path to input video file
 *         timeOffset (string) - Time offset string in seconds (default: '2')
 *         outputPath (string) - Local target thumbnail image file path
 * @Returns Promise<string> - Generated thumbnail file path
 */
async function extractVideoThumbnail(inputPath: string, timeOffset: string = '2', outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const args = [
            '-ss', timeOffset,
            '-i', inputPath,
            '-vframes', '1',
            '-vf', 'scale=300:300:force_original_aspect_ratio=increase,crop=300:300',
            '-y',
            outputPath,
        ];
        const child = spawn(FFMPEG_PATH, args);
        let stderrData = '';
        child.stderr.on('data', (data) => {
            stderrData += data;
        });
        child.on('error', (error) => {
            LoggerService.logError({
                level: 'CRITICAL',
                functionName: 'Worker:VideoProcessor',
                message: typeof error == 'string' ? error : JSON.stringify(error),
                details: { abstractMsg: `FFmpeg failed: ${error.message}` }
            })
            reject(new Error(`FFmpeg failed: ${error.message}`));
        });
        child.on('close', (code) => {
            if (code !== 0) {
                LoggerService.logError({
                    level: 'CRITICAL',
                    functionName: 'Worker:VideoProcessor',
                    message: typeof stderrData == 'string' ? stderrData : JSON.stringify(stderrData),
                    details: { abstractMsg: `FFmpeg exited with code ${code}: ${stderrData}` }
                })
                reject(new Error(`FFmpeg exited with code ${code}: ${stderrData}`));
            } else {
                resolve(outputPath);
            }
        });
    });
}

/**
 * @Description Transcodes video stream to target resolution profile (1080p, 720p, SD) and reports progress percentage to Redis.
 * @Params localFilePath (string) - Path to input video file
 *         outputPath (string) - Target output video file path
 *         resolution (string) - Resolution profile ('1080p', '720p', 'standard')
 *         totalDuration (number) - Total video duration in seconds
 *         assetId (string) - Asset UUID identifier
 * @Returns Promise<void>
 */
async function transcodeVideo(localFilePath: string, outputPath: string, resolution: string, totalDuration: number, assetId: string) {
    return new Promise((resolve, reject) => {
        const scaleFilter = resolution === 'standard' ? "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease" : resolution === '720p' ? 'scale=-2:720' : 'scale=-2:1080';
        const args = [
            '-i', localFilePath,
            '-vf', scaleFilter,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y',
            outputPath
        ];
        const child = spawn(FFMPEG_PATH, args);
        let stderrData = '';
        child.stderr.on('data', async (data: Buffer) => {
            stderrData += data.toString();
            const log = data.toString();
            // Regex to extract time=HH:MM:SS.ms
            const match = log.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (match && totalDuration > 0) {
                const hours = parseFloat(match[1]);
                const minutes = parseFloat(match[2]);
                const seconds = parseFloat(match[3]);
                const completedDuration = (hours * 3600) + (minutes * 60) + seconds;
                const percent = Math.min(100, Math.round((completedDuration / totalDuration) * 100));
                const payload: JobProgressPayload = {
                    assetId,
                    progress: percent,
                    status: 'PROCESSING',
                    stage: 'transcoding',
                }
                await publishJobProgress(payload)
            }
        });
        child.on('error', (error) => {
            LoggerService.logError({
                level: 'CRITICAL',
                functionName: 'Worker:VideoProcessor',
                message: typeof error == 'string' ? error : JSON.stringify(error),
                details: { abstractMsg: `FFmpeg failed: ${error.message}` }
            })
            reject(new Error(`FFmpeg failed: ${error.message}`));
        });
        child.on('close', (code) => {
            if (code !== 0) {
                LoggerService.logError({
                    level: 'CRITICAL',
                    functionName: 'Worker:VideoProcessor',
                    message: typeof stderrData == 'string' ? stderrData : JSON.stringify(stderrData),
                    details: { abstractMsg: `FFmpeg exited with code ${code}: ${stderrData}` }
                })
                reject(new Error(`FFmpeg exited with code ${code}: ${stderrData}`));
            } else {
                resolve(outputPath);
            }
        });
    })
}

