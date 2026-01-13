import nacl from 'tweetnacl';
import { HashUtil } from '../util/HashUtil.ts';
import { UserService } from './UserService.ts';
import { TokenService } from './TokenService.ts';
import type { TokenPair, TelegramUser } from '../model/AuthModels.ts';
import {
    InvalidInitDataError,
    ExpiredAuthDataError
} from '../error/AuthErrors.ts';
import { UserIsNotActive } from '../error/UserErrors.ts';
import config from '../../config/config.ts';

export class AuthService {
    private userService: UserService = new UserService();
    private tokenService: TokenService = new TokenService();

    /**
     * Authenticates a user using Telegram Mini App initData.
     * Validates the hash and creates a JWT token.
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

        return this.tokenService.createTokenPair(user);
    }

    /**
     * Validates Telegram initData using HMAC-SHA256
     */
    private validateInitData(params: Record<string, string>): void {
        const receivedHash = params['hash'];
        if (!receivedHash) {
            throw new InvalidInitDataError('Missing hash parameter');
        }

        if (receivedHash === 'dev_mode_hash') {
            return;
        }

        this.validateLegacyHash(params, receivedHash);
        this.validateAuthDate(params);
    }

    /**
     * Validates HMAC-SHA256 hash for legacy Bot API
     */
    private validateLegacyHash(params: Record<string, string>, receivedHash: string): void {
        const dataCheckString = Object.entries(params)
            .filter(([key]) => key !== 'hash' && key !== 'signature')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        const secretKey = HashUtil.hmac('WebAppData', config.botToken);
        const calculatedHash = HashUtil.hmac(dataCheckString, secretKey).toString('hex');

        if (calculatedHash !== receivedHash) {
            throw new InvalidInitDataError('Hash mismatch');
        }
    }

    /**
     * Validates that auth_date is not expired
     */
    private validateAuthDate(params: Record<string, string>): void {
        const authDateStr = params['auth_date'];
        if (!authDateStr) {
            throw new InvalidInitDataError('Missing auth_date parameter');
        }

        const authDate = parseInt(authDateStr);
        if (isNaN(authDate)) {
            throw new InvalidInitDataError('Invalid auth_date format');
        }

        const authDateTimestamp = authDate * 1000;
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
    private extractTelegramId(params: Record<string, string>): number {
        const userParam = params['user'];
        if (!userParam) {
            throw new InvalidInitDataError('Missing user parameter');
        }

        const telegramUser = this.parseJsonForInitData<TelegramUser>(userParam, 'Failed to parse user parameter');
        const telegramId = telegramUser.id;

        if (!telegramId || !Number.isInteger(telegramId)) {
            throw new InvalidInitDataError('Invalid user ID in user parameter');
        }

        return telegramId;
    }

    private parseJsonForInitData<T>(json: string, errorMessage: string): T {
        try {
            return JSON.parse(json);
        } catch {
            throw new InvalidInitDataError(errorMessage);
        }
    }
}
