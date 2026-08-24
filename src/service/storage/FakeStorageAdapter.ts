import type { StorageAdapter } from './StorageAdapter.ts';

export class FakeStorageAdapter implements StorageAdapter {
    public uploads: Map<string, { buffer: Buffer, contentType: string }> = new Map();

    async uploadImage(path: string, buffer: Buffer, contentType: string): Promise<string> {
        this.uploads.set(path, { buffer, contentType });
        const bucket = process.env['FIREBASE_STORAGE_BUCKET'] || 'dojo-games.firebasestorage.app';
        const encodedPath = encodeURIComponent(path);
        return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
    }
}
