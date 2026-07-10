import { HashUtil } from '../util/HashUtil.ts';
import { UserService } from './UserService.ts';
import { TokenService } from './TokenService.ts';
import type { TokenPair, TelegramUser } from '../model/AuthModels.ts';
import {
    AuthProvider,
    type AvailableAuthProviderDTO,
    type ExternalAuthProviderInput,
    type ExternalAuthProviderSession,
    type ExternalAuthRegistrationRequired,
    type LinkedAuthProviderDTO,
    type VerifiedExternalProfile,
} from '../model/AuthProviderModels.ts';
import { AuthProviderIdentityRepository } from '../repository/AuthProviderIdentityRepository.ts';
import {
    ExternalAuthProviderRegistry,
    type ExternalAuthProviderAdapter,
} from './ExternalAuthProviderRegistry.ts';
import {
    AuthProviderIdentityAlreadyLinkedError,
    InvalidInitDataError,
    ExpiredAuthDataError,
    UserAlreadyHasAuthProviderError,
} from '../error/AuthErrors.ts';
import { UserIsNotActive } from '../error/UserErrors.ts';
import { dbManager } from '../db/dbInit.ts';
import { SYSTEM_USER_ID } from '../../config/constants.ts';
import config from '../../config/config.ts';
import { ExternalAuthRegistrationService } from './ExternalAuthRegistrationService.ts';

type ExternalAuthResult = (TokenPair | ExternalAuthRegistrationRequired) & {
    providerSession?: ExternalAuthProviderSession;
};

type ExternalAuthLinkResult = LinkedAuthProviderDTO & {
    providerSession?: ExternalAuthProviderSession;
};

export class AuthService {
    private userService: UserService = new UserService();
    private tokenService: TokenService = new TokenService();
    private authProviderIdentityRepository: AuthProviderIdentityRepository = new AuthProviderIdentityRepository();
    private externalAuthProviderRegistry: ExternalAuthProviderRegistry;
    private externalAuthRegistrationService = new ExternalAuthRegistrationService();

    constructor(externalAuthProviderRegistry: ExternalAuthProviderRegistry = new ExternalAuthProviderRegistry()) {
        this.externalAuthProviderRegistry = externalAuthProviderRegistry;
    }

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

    async authenticateExternal(
        provider: AuthProvider,
        input: ExternalAuthProviderInput
    ): Promise<ExternalAuthResult> {
        const adapter = this.externalAuthProviderRegistry.getAdapter(provider);
        const { profile, providerSession } = await adapter.verify(input);
        const result = this.resolveExternalAuth(profile, adapter);
        return providerSession === undefined ? result : { ...result, providerSession };
    }

    async linkExternal(
        userId: number,
        provider: AuthProvider,
        input: ExternalAuthProviderInput
    ): Promise<ExternalAuthLinkResult> {
        const adapter = this.externalAuthProviderRegistry.getAdapter(provider);
        const { profile, providerSession } = await adapter.verify(input);
        const result = this.linkExternalAuthProvider(userId, profile, adapter);
        return providerSession === undefined ? result : { ...result, providerSession };
    }

    getLinkedProviders(userId: number): LinkedAuthProviderDTO[] {
        this.userService.getUserById(userId);
        return this.authProviderIdentityRepository.findIdentitiesByUserId(userId).map(identity => ({
            provider: identity.provider,
            displayName: identity.displayName,
            email: identity.email,
            username: identity.username,
            linkedAt: identity.createdAt.toISOString(),
        }));
    }

    getAvailableProviders(): AvailableAuthProviderDTO[] {
        return this.externalAuthProviderRegistry.getAvailableProviders();
    }

    registerExternal(registrationToken: string, name: string): TokenPair {
        return dbManager.db.transaction(() => {
            const pending = this.externalAuthRegistrationService.getValid(registrationToken);
            const profile = pending.profile;
            const adapter = this.externalAuthProviderRegistry.getAdapter(profile.provider);

            const existingIdentity = this.authProviderIdentityRepository.findIdentity(
                profile.provider,
                profile.providerUserId
            );
            const existingLegacyUser = adapter.findLegacyUser?.(profile, this.userService);
            if (existingIdentity !== undefined || existingLegacyUser !== undefined) {
                throw new AuthProviderIdentityAlreadyLinkedError(profile.provider);
            }

            const registrationFields = adapter.getRegistrationUserFields?.(profile) ?? {};
            const user = this.userService.registerUser(
                name,
                registrationFields.telegramUsername,
                registrationFields.telegramId,
                SYSTEM_USER_ID
            );
            this.authProviderIdentityRepository.createIdentity(user.id, profile);
            this.externalAuthRegistrationService.consume(pending.tokenHash);
            return this.tokenService.createTokenPair(user);
        })();
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

    private resolveExternalAuth(
        profile: VerifiedExternalProfile,
        adapter: ExternalAuthProviderAdapter
    ): ExternalAuthResult {
        return dbManager.db.transaction(() => {
            const existingIdentity = this.authProviderIdentityRepository.findIdentity(
                profile.provider,
                profile.providerUserId
            );
            if (existingIdentity !== undefined) {
                const user = this.userService.getUserById(existingIdentity.userId);
                this.validateUserIsActive(user.id, user.isActive);
                return this.tokenService.createTokenPair(user);
            }

            const existingLegacyUser = adapter.findLegacyUser?.(profile, this.userService);
            if (existingLegacyUser !== undefined) {
                this.validateUserIsActive(existingLegacyUser.id, existingLegacyUser.isActive);
                this.createIdentityForUser(existingLegacyUser.id, profile);
                return this.tokenService.createTokenPair(existingLegacyUser);
            }

            return this.externalAuthRegistrationService.create(profile);
        })();
    }

    private linkExternalAuthProvider(
        userId: number,
        profile: VerifiedExternalProfile,
        adapter: ExternalAuthProviderAdapter
    ): LinkedAuthProviderDTO {
        return dbManager.db.transaction(() => {
            const user = this.userService.getUserById(userId);
            this.validateUserIsActive(user.id, user.isActive);

            const identityForProviderAccount = this.authProviderIdentityRepository.findIdentity(
                profile.provider,
                profile.providerUserId
            );
            if (identityForProviderAccount !== undefined) {
                if (identityForProviderAccount.userId !== userId) {
                    throw new AuthProviderIdentityAlreadyLinkedError(profile.provider);
                }
                return this.toLinkedProviderDTO(identityForProviderAccount);
            }

            const identityForUser = this.authProviderIdentityRepository.findIdentityByUserAndProvider(
                userId,
                profile.provider
            );
            if (identityForUser !== undefined) {
                throw new UserAlreadyHasAuthProviderError(profile.provider);
            }

            adapter.prepareLink?.(user, profile, this.userService);

            const identity = this.authProviderIdentityRepository.createIdentity(userId, profile);
            return this.toLinkedProviderDTO(identity);
        })();
    }

    private createIdentityForUser(userId: number, profile: VerifiedExternalProfile): void {
        const identityForUser = this.authProviderIdentityRepository.findIdentityByUserAndProvider(
            userId,
            profile.provider
        );
        if (identityForUser !== undefined) {
            if (identityForUser.providerUserId !== profile.providerUserId) {
                throw new UserAlreadyHasAuthProviderError(profile.provider);
            }
            return;
        }

        this.authProviderIdentityRepository.createIdentity(userId, profile);
    }

    private validateUserIsActive(userId: number, isActive: boolean): void {
        if (!isActive) {
            throw new UserIsNotActive(userId);
        }
    }

    private toLinkedProviderDTO(identity: {
        provider: AuthProvider;
        displayName: string | null;
        email: string | null;
        username: string | null;
        createdAt: Date;
    }): LinkedAuthProviderDTO {
        return {
            provider: identity.provider,
            displayName: identity.displayName,
            email: identity.email,
            username: identity.username,
            linkedAt: identity.createdAt.toISOString(),
        };
    }
}
