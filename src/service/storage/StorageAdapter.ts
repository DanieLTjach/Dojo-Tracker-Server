export interface StorageAdapter {
    uploadImage(path: string, buffer: Buffer, contentType: string): Promise<string>;
}
