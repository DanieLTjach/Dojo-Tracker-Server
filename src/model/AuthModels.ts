/**
 * Access token returned by TokenService.
 */
export interface AccessTokenPair {
    accessToken: string;
}

/**
 * Token pair returned after successful authentication.
 */
export interface TokenPair extends AccessTokenPair {
    refreshToken: string;
}

export interface GeneratedRefreshToken {
    token: string;
    tokenHash: string;
}

export interface RefreshTokenRow {
    id: number;
    userId: number;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
    createdAt: Date;
    rotatedAt: Date | null;
    revokedAt: Date | null;
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
    first_name?: string;
    last_name?: string;
}
