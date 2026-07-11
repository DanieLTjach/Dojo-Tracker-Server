import config from '../../config/config.ts';
import {
    AuthProviderIdentityAlreadyLinkedError,
    AuthProviderNotConfiguredError,
    InvalidExternalAuthTokenError,
    UserAlreadyHasAuthProviderError,
} from '../error/AuthErrors.ts';
import {
    AuthProvider,
    type AvailableAuthProviderDTO,
    type ExternalAuthFlow,
    type ExternalAuthProviderInput,
    type VerifiedExternalAuth,
    type VerifiedExternalProfile,
} from '../model/AuthProviderModels.ts';
import type { User } from '../model/UserModels.ts';
import {
    DiscordAuthTokenVerifier,
    GoogleAuthTokenVerifier,
    TelegramAuthTokenVerifier,
} from './ExternalAuthTokenVerifier.ts';
import { UserService } from './UserService.ts';

interface ExternalProfileVerifier {
    verify(value: string): Promise<VerifiedExternalProfile>;
}

interface DiscordExternalAuthVerifier {
    verify(input: Extract<ExternalAuthProviderInput, { code: string }>): Promise<VerifiedExternalAuth>;
}

export interface ExternalAuthRegistrationUserFields {
    telegramUsername?: string;
    telegramId?: number;
}

export interface ExternalAuthProviderAdapter {
    readonly provider: AuthProvider;
    readonly flows: ExternalAuthFlow[];
    isConfigured(): boolean;
    verify(input: ExternalAuthProviderInput): Promise<VerifiedExternalAuth>;
    findLegacyUser?(profile: VerifiedExternalProfile, userService: UserService): User | undefined;
    prepareLink?(user: User, profile: VerifiedExternalProfile, userService: UserService): void;
    getRegistrationUserFields?(profile: VerifiedExternalProfile): ExternalAuthRegistrationUserFields;
}

export class GoogleAuthProviderAdapter implements ExternalAuthProviderAdapter {
    readonly provider = AuthProvider.GOOGLE;
    readonly flows: ExternalAuthFlow[] = ['BROWSER'];

    private verifier: ExternalProfileVerifier;

    constructor(verifier: ExternalProfileVerifier = new GoogleAuthTokenVerifier()) {
        this.verifier = verifier;
    }

    isConfigured(): boolean {
        return config.googleClientId !== undefined;
    }

    async verify(input: ExternalAuthProviderInput): Promise<VerifiedExternalAuth> {
        if (!('credential' in input)) {
            throw new InvalidExternalAuthTokenError(this.provider);
        }
        return { profile: await this.verifier.verify(input.credential) };
    }
}

export class TelegramAuthProviderAdapter implements ExternalAuthProviderAdapter {
    readonly provider = AuthProvider.TELEGRAM;
    readonly flows: ExternalAuthFlow[] = ['BROWSER'];

    private verifier: ExternalProfileVerifier;

    constructor(verifier: ExternalProfileVerifier = new TelegramAuthTokenVerifier()) {
        this.verifier = verifier;
    }

    isConfigured(): boolean {
        return config.telegramLoginClientId !== undefined;
    }

    async verify(input: ExternalAuthProviderInput): Promise<VerifiedExternalAuth> {
        if (!('idToken' in input)) {
            throw new InvalidExternalAuthTokenError(this.provider);
        }
        return { profile: await this.verifier.verify(input.idToken) };
    }

    findLegacyUser(profile: VerifiedExternalProfile, userService: UserService): User | undefined {
        if (profile.telegramId === undefined) {
            return undefined;
        }
        return userService.getOptionalUserByTelegramId(profile.telegramId);
    }

    prepareLink(user: User, profile: VerifiedExternalProfile, userService: UserService): void {
        if (profile.telegramId === undefined) {
            throw new InvalidExternalAuthTokenError(this.provider);
        }
        if (user.telegramId !== null && user.telegramId !== profile.telegramId) {
            throw new UserAlreadyHasAuthProviderError(this.provider);
        }

        const existingTelegramUser = userService.getOptionalUserByTelegramId(profile.telegramId);
        if (existingTelegramUser !== undefined && existingTelegramUser.id !== user.id) {
            throw new AuthProviderIdentityAlreadyLinkedError(this.provider);
        }
        if (user.telegramId === null) {
            userService.setUserTelegramId(user.id, profile.telegramId, user.id);
        }
    }

    getRegistrationUserFields(profile: VerifiedExternalProfile): ExternalAuthRegistrationUserFields {
        const fields: ExternalAuthRegistrationUserFields = {};
        if (profile.username !== undefined) {
            fields.telegramUsername = profile.username;
        }
        if (profile.telegramId !== undefined) {
            fields.telegramId = profile.telegramId;
        }
        return fields;
    }
}

export class DiscordAuthProviderAdapter implements ExternalAuthProviderAdapter {
    readonly provider = AuthProvider.DISCORD;
    readonly flows: ExternalAuthFlow[] = ['BROWSER', 'ACTIVITY'];

    private verifier: DiscordExternalAuthVerifier;

    constructor(verifier: DiscordExternalAuthVerifier = new DiscordAuthTokenVerifier()) {
        this.verifier = verifier;
    }

    isConfigured(): boolean {
        return config.discordClientId !== undefined &&
            config.discordClientSecret !== undefined &&
            config.discordBrowserRedirectUri !== undefined;
    }

    async verify(input: ExternalAuthProviderInput): Promise<VerifiedExternalAuth> {
        if (!('code' in input)) {
            throw new InvalidExternalAuthTokenError(this.provider);
        }
        return this.verifier.verify(input);
    }
}

export class ExternalAuthProviderRegistry {
    private adapters: Map<AuthProvider, ExternalAuthProviderAdapter>;

    constructor(adapters: ExternalAuthProviderAdapter[] = [
        new GoogleAuthProviderAdapter(),
        new TelegramAuthProviderAdapter(),
        new DiscordAuthProviderAdapter(),
    ]) {
        this.adapters = new Map(adapters.map(adapter => [adapter.provider, adapter]));
    }

    getAdapter(provider: AuthProvider): ExternalAuthProviderAdapter {
        const adapter = this.adapters.get(provider);
        if (adapter === undefined) {
            throw new AuthProviderNotConfiguredError(provider);
        }
        return adapter;
    }

    async verify(provider: AuthProvider, input: ExternalAuthProviderInput): Promise<VerifiedExternalAuth> {
        return this.getAdapter(provider).verify(input);
    }

    getAvailableProviders(): AvailableAuthProviderDTO[] {
        return [...this.adapters.values()]
            .filter(adapter => adapter.isConfigured())
            .map(adapter => ({ provider: adapter.provider, flows: adapter.flows }));
    }
}
