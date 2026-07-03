import crypto from 'crypto';
import { HashUtil } from '../util/HashUtil.ts';
import { UserService } from './UserService.ts';
import { TokenService } from './TokenService.ts';
import type { RefreshTokenRow, TokenPair, TelegramUser } from '../model/AuthModels.ts';
import {
    ExpiredAuthDataError,
    InvalidAuthTokenError,
    InvalidInitDataError,
    InvalidRefreshTokenError,
    RefreshTokenExpiredError,
} from '../error/AuthErrors.ts';
import { UserIsNotActive } from '../error/UserErrors.ts';
import config from '../../config/config.ts';
import { RefreshTokenRepository } from '../repository/RefreshTokenRepository.ts';
import type { User } from '../model/UserModels.ts';
import { dbManager } from '../db/dbInit.ts';

export class AuthService {
    private userService: UserService = new UserService();
    private tokenService: TokenService = new TokenService();
    private refreshTokenRepository: RefreshTokenRepository = new RefreshTokenRepository();

    /**
     * Authenticates a user using Telegram Mini App initData.
     * Validates the hash and creates an access/refresh token pair.
     *
     * @param params - Query parameters from initData (as key-value object)
     * @returns TokenPair with JWT access token
     */
    authenticate(params: Record<string, string>): TokenPair {
        this.validateInitData(params);

        const telegramId = this.extractTelegramId(params);
        const user = this.userService.getUserByTelegramId(telegramId);

        if (!user.isActive) {
            throw new UserIsNotActive(user.id);
        }

        return this.createSessionTokenPair(user, crypto.randomUUID());
    }

    refresh(refreshToken: unknown): TokenPair {
        let refreshError: InvalidRefreshTokenError | undefined;
        const tokenPair = dbManager.db.transaction(() => {
            const tokenRow = this.findRefreshToken(refreshToken);
            const now = new Date();

            if (tokenRow.revokedAt !== null) {
                throw new InvalidRefreshTokenError();
            }

            if (tokenRow.rotatedAt !== null) {
                this.refreshTokenRepository.revokeFamily(tokenRow.familyId, now);
                refreshError = new InvalidRefreshTokenError();
                return undefined;
            }

            if (tokenRow.expiresAt.getTime() <= now.getTime()) {
                throw new RefreshTokenExpiredError();
            }

            const user = this.userService.getUserById(tokenRow.userId);
            if (!user.isActive) {
                throw new InvalidAuthTokenError('User is inactive');
            }

            this.refreshTokenRepository.markRotated(tokenRow.id, now);
            const nextTokenPair = this.createSessionTokenPair(user, tokenRow.familyId, now);
            this.refreshTokenRepository.deleteExpired(now);

            return nextTokenPair;
        })();

        if (refreshError !== undefined) {
            throw refreshError;
        }

        if (tokenPair === undefined) {
            throw new InvalidRefreshTokenError();
        }

        return tokenPair;
    }

    /**
     * Validates Telegram initData by checking the hash.
     * Algorithm from: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
     *
     * @param params - Query parameters from initData
     * @throws InvalidInitDataError if validation fails
     * @throws ExpiredAuthDataError if auth_date is too old
     */
    validateInitData(params: Record<string, string>): void {
        // Get hash from params
        const receivedHash = params['hash'];
        if (!receivedHash) {
            throw new InvalidInitDataError('Missing hash parameter');
        }

        // Create data-check-string (all params except hash, sorted alphabetically)
        const dataCheckString = Object.entries(params)
            .filter(([key]) => key !== 'hash')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // Calculate secret key: HMAC-SHA256(bot_token, "WebAppData")
        const secretKey = HashUtil.hmac(config.botToken, 'WebAppData');

        // Calculate hash: HMAC-SHA256(data_check_string, secret_key)
        const calculatedHash = HashUtil.hmac(dataCheckString, secretKey).toString('hex');

        // Compare hashes
        if (calculatedHash !== receivedHash) {
            throw new InvalidInitDataError('Hash mismatch');
        }

        // Validate auth_date (check if not expired)
        const authDateStr = params['auth_date'];
        if (!authDateStr) {
            throw new InvalidInitDataError('Missing auth_date parameter');
        }

        const authDate = parseInt(authDateStr);
        if (isNaN(authDate)) {
            throw new InvalidInitDataError('Invalid auth_date format');
        }

        const authDateTimestamp = authDate * 1000; // Convert to milliseconds
        const now = Date.now();
        const expiryTime = authDateTimestamp + (config.authInitDataValiditySeconds * 1000);

        if (now > expiryTime) {
            throw new ExpiredAuthDataError();
        }
    }

    /**
     * Extracts Telegram user ID from the 'user' parameter in initData.
     *
     * @param params - Query parameters from initData
     * @returns Telegram user ID
     * @throws InvalidInitDataError if user ID is missing or invalid
     */
    extractTelegramId(params: Record<string, string>): number {
        const telegramUser = this.extractTelegramUser(params);
        return telegramUser.id;
    }

    /**
     * Extracts full Telegram user data from the 'user' parameter in initData.
     *
     * @param params - Query parameters from initData
     * @returns Telegram user object
     * @throws InvalidInitDataError if user data is missing or invalid
     */
    extractTelegramUser(params: Record<string, string>): TelegramUser {
        const userParam = params['user'];
        if (!userParam) {
            throw new InvalidInitDataError('Missing user parameter');
        }

        const telegramUser = this.parseJsonForInitData<TelegramUser>(userParam, 'Failed to parse user parameter');
        const telegramId = telegramUser.id;

        if (!telegramId || !Number.isInteger(telegramId)) {
            throw new InvalidInitDataError('Invalid user ID in user parameter');
        }

        return telegramUser;
    }

    private parseJsonForInitData<T>(json: string, errorMessage: string): T {
        try {
            return JSON.parse(json);
        } catch {
            throw new InvalidInitDataError(errorMessage);
        }
    }

    private findRefreshToken(refreshToken: unknown): RefreshTokenRow {
        if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
            throw new InvalidRefreshTokenError();
        }

        const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
        const tokenRow = this.refreshTokenRepository.findByHash(tokenHash);
        if (tokenRow === undefined) {
            throw new InvalidRefreshTokenError();
        }

        return tokenRow;
    }

    private createSessionTokenPair(user: User, familyId: string, now: Date = new Date()): TokenPair {
        const refreshToken = this.tokenService.generateRefreshToken();
        const expiresAt = new Date(now.getTime() + config.refreshTokenExpiryDays * 24 * 60 * 60 * 1000);

        this.refreshTokenRepository.insert(user.id, refreshToken.tokenHash, familyId, expiresAt, now);

        return {
            accessToken: this.tokenService.createTokenPair(user).accessToken,
            refreshToken: refreshToken.token,
        };
    }
}
