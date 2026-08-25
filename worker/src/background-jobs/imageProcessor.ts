import sharp from "sharp";
import * as fs from 'fs';
import path from "path";

export const generateImageThumbnail = async (localPath: string, localDir: string) => {
    if (!fs.existsSync(localPath)) {
        throw new Error('❌ Image file does not exist at ' + localPath);
    }
    if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
    }
    const filename = path.parse(localPath).name;
    const thumbnailPath = path.join(localDir, `thumbnail_${filename}.jpg`);
    try {
        const metadata = await sharp(localPath).metadata();
        await sharp(localPath)
            .rotate()
            .resize(300, 300, {
                fit: 'cover',        // Crops to fill 300x300 square without stretching
                position: 'center', // Centers the crop
            })
            .toFormat('jpeg', { quality: 80 }) // Converts output to JPEG with 80% quality
            .toFile(thumbnailPath);
        return { thumbnailPath, metadata };
    }
    catch (error: any) {
        throw new Error('❌ Failed to generate thumbnail: ' + error.message);
    }
}