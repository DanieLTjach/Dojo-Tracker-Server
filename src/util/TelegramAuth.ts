import crypto from 'crypto';
import config from '../../config/config.ts';

export interface TelegramInitData {
    query_id?: string;
    user?: {
        id: number;
        first_name: string;
        last_name?: string;
        username?: string;
        language_code?: string;
        is_premium?: boolean;
        photo_url?: string;
    };
    auth_date: number;
    hash: string;
}

/**
 * Validates Telegram Mini App initData
 * @param initDataString The raw initData string from Telegram WebApp
 * @returns Parsed initData if valid, throws error if invalid
 */
export function validateTelegramInitData(initDataString: string): TelegramInitData {
    try {
        // Parse the initData string into URLSearchParams
        const params = new URLSearchParams(initDataString);
        const hash = params.get('hash');

        if (!hash) {
            throw new Error('Hash is missing from initData');
        }

        // Development mode: Skip cryptographic validation for mock data
        const isDevelopment = process.env.NODE_ENV === 'development' || !config.botToken;
        const isDevHash = hash === 'dev_mode_hash';

        if (isDevelopment && isDevHash) {
            console.log('⚠️  Development mode: Skipping Telegram initData validation');

            // Parse user data
            const userJson = params.get('user');
            if (!userJson) {
                throw new Error('User data is missing from initData');
            }

            const user = JSON.parse(userJson);
            const authDate = parseInt(params.get('auth_date') || '0');

            return {
                query_id: params.get('query_id') || undefined,
                user,
                auth_date: authDate,
                hash
            };
        }

        // Production mode: Validate cryptographic signature
        if (!config.botToken) {
            throw new Error('BOT_TOKEN is not configured. Cannot validate initData.');
        }

        // Remove hash from params for validation
        params.delete('hash');

        // Sort params alphabetically and create data check string
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // Create secret key from bot token
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(config.botToken)
            .digest();

        // Calculate hash
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        // Verify hash
        if (calculatedHash !== hash) {
            throw new Error('Invalid initData hash - data may have been tampered with');
        }

        // Check auth_date (data shouldn't be older than 24 hours)
        const authDate = parseInt(params.get('auth_date') || '0');
        const currentTime = Math.floor(Date.now() / 1000);
        const maxAge = 24 * 60 * 60; // 24 hours in seconds

        if (currentTime - authDate > maxAge) {
            throw new Error('InitData is too old (older than 24 hours)');
        }

        // Parse user data
        const userJson = params.get('user');
        if (!userJson) {
            throw new Error('User data is missing from initData');
        }

        const user = JSON.parse(userJson);

        return {
            query_id: params.get('query_id') || undefined,
            user,
            auth_date: authDate,
            hash
        };
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to validate Telegram initData: ${error.message}`);
        }
        throw new Error('Failed to validate Telegram initData: Unknown error');
    }
}

/**
 * Validates Telegram initData without throwing errors (for optional auth)
 * @param initDataString The raw initData string from Telegram WebApp
 * @returns Parsed initData if valid, null if invalid
 */
export function validateTelegramInitDataSafe(initDataString: string): TelegramInitData | null {
    try {
        return validateTelegramInitData(initDataString);
    } catch {
        return null;
    }
}
