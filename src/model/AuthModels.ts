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
    iat?: number; // Issued at
    exp?: number; // Expiration
}

/**
 * Telegram user data from initData
 */
export interface TelegramUser {
    id: number;
    username?: string;
}
