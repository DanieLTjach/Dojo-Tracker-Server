import sharp from 'sharp';
import { InvalidImageFileError } from '../error/MediaErrors.ts';

export class ImageProcessingService {
    async normalizeAchievementIcon(buffer: Buffer): Promise<Buffer> {
        try {
            const image = sharp(buffer);
            const metadata = await image.metadata();

            if (!metadata.format || !['png', 'jpeg', 'jpg', 'webp'].includes(metadata.format)) {
                throw new InvalidImageFileError();
            }

            return await image
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                })
                .webp({ quality: 90, alphaQuality: 100 })
                .toBuffer();
        } catch (err: any) {
            if (err instanceof InvalidImageFileError) {
                throw err;
            }
            throw new InvalidImageFileError();
        }
    }
}
