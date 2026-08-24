import { Storage } from '@google-cloud/storage';
import type { StorageAdapter } from './StorageAdapter.ts';
import LogService from '../LogService.ts';

export class FirebaseStorageAdapter implements StorageAdapter {
    private storage: Storage;
    private bucketName: string;

    constructor() {
        this.bucketName = process.env['FIREBASE_STORAGE_BUCKET'] || 'dojo-games.firebasestorage.app';

        const serviceAccountB64 = process.env['FIREBASE_SERVICE_ACCOUNT_BASE64'];
        if (serviceAccountB64) {
            try {
                const credentials = JSON.parse(Buffer.from(serviceAccountB64, 'base64').toString('utf-8'));
                this.storage = new Storage({
                    credentials,
                    projectId: credentials.project_id,
                });
            } catch (err) {
                LogService.logError('Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64:', err);
                this.storage = new Storage();
            }
        } else {
            this.storage = new Storage();
        }
    }

    async uploadImage(path: string, buffer: Buffer, contentType: string): Promise<string> {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(path);

        await file.save(buffer, {
            contentType,
            resumable: false,
            metadata: {
                cacheControl: 'public, max-age=31536000',
            },
        });

        const encodedPath = encodeURIComponent(path);
        return `https://firebasestorage.googleapis.com/v0/b/${this.bucketName}/o/${encodedPath}?alt=media`;
    }
}
