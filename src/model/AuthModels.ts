/**
 * Token pair returned after successful authentication
 */
export interface TokenPair {
    accessToken: string;
    refreshToken?: string; // Optional for future implementation
}

/**
 * Decoded JWT token payload
 */
export interface DecodedToken {
    userId: number;
    telegramId: number;
    isAdmin: boolean;
    isActive: boolean;
    iat?: number; // Issued at
    exp?: number; // Expiration
}

/**
 * Telegram user data from initData
 */
export interface TelegramUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
}
