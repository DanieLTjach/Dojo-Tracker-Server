import crypto from 'crypto';
import type { StorageAdapter } from './storage/StorageAdapter.ts';
import { FirebaseStorageAdapter } from './storage/FirebaseStorageAdapter.ts';
import { ImageProcessingService } from './ImageProcessingService.ts';
import { ClubService } from './ClubService.ts';
import { ClubMembershipService } from './ClubMembershipService.ts';
import { UserService } from './UserService.ts';
import { InsufficientClubPermissionsError } from '../error/ClubErrors.ts';
import { ImageUploadFailedError, InvalidImageFileError, NoImageFileProvidedError } from '../error/MediaErrors.ts';
import LogService from './LogService.ts';

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MiB

export class AchievementMediaService {
    private storageAdapter: StorageAdapter;
    private imageProcessingService: ImageProcessingService = new ImageProcessingService();
    private clubService: ClubService = new ClubService();
    private clubMembershipService: ClubMembershipService = new ClubMembershipService();
    private userService: UserService = new UserService();

    constructor(storageAdapter?: StorageAdapter) {
        this.storageAdapter = storageAdapter ?? new FirebaseStorageAdapter();
    }

    setStorageAdapter(storageAdapter: StorageAdapter): void {
        this.storageAdapter = storageAdapter;
    }

    async uploadClubAchievementIcon(
        clubId: number,
        fileBuffer: Buffer | undefined,
        modifiedBy: number
    ): Promise<{ iconUrl: string }> {
        this.clubService.validateClubExists(clubId);

        const user = this.userService.getUserById(modifiedBy);
        if (!user.isAdmin) {
            const role = this.clubMembershipService.getUserClubRole(clubId, modifiedBy);
            if (role !== 'OWNER' && role !== 'MODERATOR') {
                throw new InsufficientClubPermissionsError(['OWNER', 'MODERATOR']);
            }
        }

        if (!fileBuffer || fileBuffer.length === 0) {
            throw new NoImageFileProvidedError();
        }

        if (fileBuffer.length > MAX_IMAGE_SIZE_BYTES) {
            throw new InvalidImageFileError();
        }

        const normalizedBuffer = await this.imageProcessingService.normalizeAchievementIcon(fileBuffer);
        const fileName = `${crypto.randomUUID()}.webp`;
        const storagePath = `achievement-icons/custom/${clubId}/${fileName}`;

        try {
            const iconUrl = await this.storageAdapter.uploadImage(storagePath, normalizedBuffer, 'image/webp');
            return { iconUrl };
        } catch (err) {
            LogService.logError(`Failed to upload achievement icon for club ${clubId}:`, err);
            throw new ImageUploadFailedError();
        }
    }
}
