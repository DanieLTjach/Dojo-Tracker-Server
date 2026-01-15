import { HashUtil } from '../util/HashUtil.ts';
import { UserService } from './UserService.ts';
import { TokenService } from './TokenService.ts';
import type { TokenPair, TelegramUser } from '../model/AuthModels.ts';
import {
    InvalidInitDataError,
    ExpiredAuthDataError
} from '../error/AuthErrors.ts';
import { UserIsNotActive, UserNotFoundByTelegramId } from '../error/UserErrors.ts';
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

        const telegramUser = this.extractTelegramUser(params);
        let user = this.userService.findUserByTelegramId(telegramUser.id);

        // Fallback: find by username and link telegram ID (for migrated users)
        if (!user && telegramUser.username) {
            const username = `@${telegramUser.username}`;
            const userByUsername = this.userService.findUserByTelegramUsername(username);

            if (userByUsername) {
                user = this.userService.linkTelegramIdToUser(userByUsername.id, telegramUser.id);
                console.log(`Linked telegram ID ${telegramUser.id} to existing user ${user.id} (${username})`);
            }
        }

        if (!user) {
            throw new UserNotFoundByTelegramId(telegramUser.id);
        }

        if (!user.isActive) {
            throw new UserIsNotActive(user.id);
        }

        return this.tokenService.createTokenPair(user);
    }

    /**
     * Validates Telegram initData by checking the hash.
     * Algorithm from: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
     *
     * @param params - Query parameters from initData
     * @throws InvalidInitDataError if validation fails
     * @throws ExpiredAuthDataError if auth_date is too old
     */
    private validateInitData(params: Record<string, string>): void {
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
     * Extracts Telegram user from the 'user' parameter in initData.
     *
     * @param params - Query parameters from initData
     * @returns TelegramUser object
     * @throws InvalidInitDataError if user data is missing or invalid
     */
    private extractTelegramUser(params: Record<string, string>): TelegramUser {
        const userParam = params['user'];
        if (!userParam) {
            throw new InvalidInitDataError('Missing user parameter');
        }

        const telegramUser = this.parseJsonForInitData<TelegramUser>(userParam, 'Failed to parse user parameter');

        if (!telegramUser.id || !Number.isInteger(telegramUser.id)) {
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
}
