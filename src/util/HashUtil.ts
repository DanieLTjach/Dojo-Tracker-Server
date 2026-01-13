import crypto from 'crypto';

/**
 * Utility class for HMAC-SHA256 hashing operations.
 * Used for Telegram initData validation.
 */
export class HashUtil {
    /**
     * Creates an HMAC-SHA256 hash.
     * @param key - The key to use for hashing (string or Buffer)
     * @param data - The data to hash (string or Buffer)
     * @returns Buffer containing the hash
     */
    static hmac(key: string | Buffer, data: string | Buffer): Buffer {
        const keyBuffer = typeof key === 'string' ? Buffer.from(key) : key;
        const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;

        return crypto
            .createHmac('sha256', keyBuffer)
            .update(dataBuffer)
            .digest();
    }
}
