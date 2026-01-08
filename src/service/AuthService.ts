import { HashUtil } from '../util/HashUtil.ts';
import { UserService } from './UserService.ts';
import { TokenService } from './TokenService.ts';
import type { TokenPair, TelegramUser } from '../model/AuthModels.ts';
import { InvalidInitDataError, ExpiredAuthDataError } from '../error/AuthErrors.ts';
import config from '../../config/config.ts';

export class AuthService {
    private botToken: string;
    private initDataValiditySeconds: number;
    private userService: UserService;
    private tokenService: TokenService;

    constructor() {
        this.botToken = config.botToken;
        this.initDataValiditySeconds = config.authInitDataValiditySeconds;
        this.userService = new UserService();
        this.tokenService = new TokenService();

        if (!this.botToken) {
            console.warn('⚠️  WARNING: BOT_TOKEN is not set in environment variables!');
        }
    }

    /**
     * Authenticates a user using Telegram Mini App initData.
     * Validates the hash and creates a JWT token.
     *
     * @param params - Query parameters from initData (as key-value object)
     * @returns TokenPair with JWT access token, user info, and isNewUser flag
     */
    authenticate(params: Record<string, string>): TokenPair & { user: any; isNewUser: boolean } {
        // Step 1: Validate initData hash
        this.validateInitData(params);

        // Step 2: Extract Telegram user ID
        const telegramId = this.extractTelegramId(params);

        // Step 3: Get or create user
        const { user, isNewUser } = this.userService.getOrCreateUserByTelegramId(telegramId, params['user']);

        // Step 4: Generate JWT token
        const tokens = this.tokenService.createTokenPair(user);

        return {
            ...tokens,
            user: {
                id: user.id,
                telegramId: user.telegramId,
                name: user.name,
                telegramUsername: user.telegramUsername,
                isAdmin: !!user.isAdmin,
                isActive: !!user.isActive,
            },
            isNewUser,
        };
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
        const secretKey = HashUtil.hmac('WebAppData', this.botToken);

        // Calculate hash: HMAC-SHA256(data_check_string, secret_key)
        const calculatedHash = HashUtil.hmacHex(dataCheckString, secretKey);

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
        const expiryTime = authDateTimestamp + this.initDataValiditySeconds * 1000;

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

        try {
            const telegramUser: TelegramUser = JSON.parse(userParam);
            const telegramId = telegramUser.id;

            if (!telegramId || !Number.isInteger(telegramId)) {
                throw new InvalidInitDataError('Invalid user ID in user parameter');
            }

            return telegramId;
        } catch (error) {
            if (error instanceof InvalidInitDataError) {
                throw error;
            }
            throw new InvalidInitDataError('Failed to parse user parameter');
        }
    }
}
