import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import config from '../../config/config.ts';
import {
    AuthProvider,
    type DiscordExternalAuthInput,
    type VerifiedExternalAuth,
    type VerifiedExternalProfile,
} from '../model/AuthProviderModels.ts';
import {
    AuthProviderNotConfiguredError,
    ExternalAuthProviderUnavailableError,
    InvalidExternalAuthTokenError,
} from '../error/AuthErrors.ts';

function isProviderUnavailableError(error: unknown): boolean {
    if (error instanceof errors.JWKSTimeout) {
        return true;
    }
    if (
        error instanceof errors.JOSEError &&
        (
            error.message === 'Expected 200 OK from the JSON Web Key Set HTTP response' ||
            error.message === 'Failed to parse the JSON Web Key Set HTTP response as JSON'
        )
    ) {
        return true;
    }
    if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
        return true;
    }
    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const code = 'code' in error ? error.code : undefined;
    if (typeof code === 'string' && ['ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'].includes(code)) {
        return true;
    }

    const response = 'response' in error ? error.response : undefined;
    if (typeof response !== 'object' || response === null || !('status' in response)) {
        return false;
    }
    const status = response.status;
    return typeof status === 'number' && (status === 429 || status >= 500);
}

export class GoogleAuthTokenVerifier {
    private client = new OAuth2Client();

    async verify(credential: string): Promise<VerifiedExternalProfile> {
        if (config.googleClientId === undefined) {
            throw new AuthProviderNotConfiguredError(AuthProvider.GOOGLE);
        }

        try {
            const ticket = await this.client.verifyIdToken({
                idToken: credential,
                audience: config.googleClientId,
            });
            const payload = ticket.getPayload();
            if (payload?.sub === undefined) {
                throw new InvalidExternalAuthTokenError(AuthProvider.GOOGLE);
            }

            const profile: VerifiedExternalProfile = {
                provider: AuthProvider.GOOGLE,
                providerUserId: payload.sub,
            };
            if (payload.name !== undefined) {
                profile.displayName = payload.name;
            }
            if (payload.email !== undefined) {
                profile.email = payload.email;
            }
            return profile;
        } catch (error) {
            if (error instanceof AuthProviderNotConfiguredError) {
                throw error;
            }
            if (isProviderUnavailableError(error)) {
                throw new ExternalAuthProviderUnavailableError(AuthProvider.GOOGLE);
            }
            throw new InvalidExternalAuthTokenError(AuthProvider.GOOGLE);
        }
    }
}

export class TelegramAuthTokenVerifier {
    private jwks: JWTVerifyGetKey;

    constructor(
        jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL('https://oauth.telegram.org/.well-known/jwks.json'))
    ) {
        this.jwks = jwks;
    }

    async verify(idToken: string): Promise<VerifiedExternalProfile> {
        if (config.telegramLoginClientId === undefined) {
            throw new AuthProviderNotConfiguredError(AuthProvider.TELEGRAM);
        }

        try {
            const { payload } = await jwtVerify(idToken, this.jwks, {
                issuer: 'https://oauth.telegram.org',
                audience: config.telegramLoginClientId,
            });
            const telegramId = this.parseTelegramId(payload['id']);
            const username = typeof payload['preferred_username'] === 'string'
                ? payload['preferred_username']
                : undefined;
            const fullName = typeof payload['name'] === 'string' ? payload['name'].trim() : '';
            const givenName = typeof payload['given_name'] === 'string' ? payload['given_name'] : undefined;
            const familyName = typeof payload['family_name'] === 'string' ? payload['family_name'] : undefined;
            const displayName = fullName || [givenName, familyName].filter(Boolean).join(' ').trim() || undefined;

            const profile: VerifiedExternalProfile = {
                provider: AuthProvider.TELEGRAM,
                providerUserId: String(telegramId),
                telegramId,
            };
            if (displayName !== undefined) {
                profile.displayName = displayName;
            }
            if (username !== undefined) {
                profile.username = username.startsWith('@') ? username : `@${username}`;
            }
            return profile;
        } catch (error) {
            if (error instanceof AuthProviderNotConfiguredError) {
                throw error;
            }
            if (isProviderUnavailableError(error)) {
                throw new ExternalAuthProviderUnavailableError(AuthProvider.TELEGRAM);
            }
            throw new InvalidExternalAuthTokenError(AuthProvider.TELEGRAM);
        }
    }

    private parseTelegramId(value: unknown): number {
        const id = typeof value === 'number' ? value : Number(value);
        if (!Number.isInteger(id)) {
            throw new InvalidExternalAuthTokenError(AuthProvider.TELEGRAM);
        }
        return id;
    }
}

export class DiscordAuthTokenVerifier {
    private fetch: typeof fetch;

    constructor(fetchImplementation: typeof fetch = globalThis.fetch) {
        this.fetch = fetchImplementation;
    }

    async verify(input: DiscordExternalAuthInput): Promise<VerifiedExternalAuth> {
        if (
            config.discordClientId === undefined ||
            config.discordClientSecret === undefined ||
            config.discordBrowserRedirectUri === undefined
        ) {
            throw new AuthProviderNotConfiguredError(AuthProvider.DISCORD);
        }

        try {
            const tokenRequest = new URLSearchParams({
                client_id: config.discordClientId,
                client_secret: config.discordClientSecret,
                grant_type: 'authorization_code',
                code: input.code,
            });
            if (input.flow === 'BROWSER') {
                tokenRequest.set('redirect_uri', config.discordBrowserRedirectUri);
                tokenRequest.set('code_verifier', input.codeVerifier);
            }

            const tokenResponse = await this.fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: tokenRequest.toString(),
            });

            if (!tokenResponse.ok) {
                this.throwDiscordResponseError(tokenResponse.status);
            }

            const tokenData = await tokenResponse.json() as { access_token?: unknown, expires_in?: unknown };
            const accessToken = tokenData.access_token;
            const expiresIn = tokenData.expires_in;
            if (typeof accessToken !== 'string' || typeof expiresIn !== 'number' || expiresIn <= 0) {
                throw new ExternalAuthProviderUnavailableError(AuthProvider.DISCORD);
            }

            const userResponse = await this.fetch('https://discord.com/api/v10/users/@me', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!userResponse.ok) {
                this.throwDiscordResponseError(userResponse.status);
            }

            const userData = await userResponse.json() as {
                id?: unknown;
                username?: unknown;
                global_name?: unknown;
            };

            if (
                typeof userData.id !== 'string' ||
                !/^\d+$/.test(userData.id) ||
                typeof userData.username !== 'string'
            ) {
                throw new ExternalAuthProviderUnavailableError(AuthProvider.DISCORD);
            }

            const profile: VerifiedExternalProfile = {
                provider: AuthProvider.DISCORD,
                providerUserId: userData.id,
                displayName: typeof userData.global_name === 'string' ? userData.global_name : userData.username,
                username: userData.username,
            };

            const result: VerifiedExternalAuth = { profile };
            if (input.flow === 'ACTIVITY') {
                result.providerSession = {
                    provider: AuthProvider.DISCORD,
                    accessToken,
                    expiresIn,
                };
            }
            return result;
        } catch (error) {
            if (
                error instanceof AuthProviderNotConfiguredError ||
                error instanceof InvalidExternalAuthTokenError ||
                error instanceof ExternalAuthProviderUnavailableError
            ) {
                throw error;
            }
            if (isProviderUnavailableError(error)) {
                throw new ExternalAuthProviderUnavailableError(AuthProvider.DISCORD);
            }
            throw new ExternalAuthProviderUnavailableError(AuthProvider.DISCORD);
        }
    }

    private throwDiscordResponseError(status: number): never {
        if (status === 429 || status >= 500) {
            throw new ExternalAuthProviderUnavailableError(AuthProvider.DISCORD);
        }
        throw new InvalidExternalAuthTokenError(AuthProvider.DISCORD);
    }
}
