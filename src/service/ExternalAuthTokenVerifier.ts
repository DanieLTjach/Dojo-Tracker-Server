import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import config from '../../config/config.ts';
import { AuthProvider, type VerifiedExternalProfile } from '../model/AuthProviderModels.ts';
import {
    AuthProviderNotConfiguredError,
    InvalidExternalAuthTokenError,
} from '../error/AuthErrors.ts';

export interface ExternalAuthTokenVerifier {
    verifyGoogleCredential(credential: string): Promise<VerifiedExternalProfile>;
    verifyTelegramIdToken(idToken: string): Promise<VerifiedExternalProfile>;
    verifyDiscordCode(code: string): Promise<VerifiedExternalProfile>;
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
            throw new InvalidExternalAuthTokenError(AuthProvider.GOOGLE);
        }
    }
}

export class TelegramAuthTokenVerifier {
    private jwks = createRemoteJWKSet(new URL('https://oauth.telegram.org/.well-known/jwks.json'));

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
            const username = typeof payload['username'] === 'string' ? payload['username'] : undefined;
            const firstName = typeof payload['first_name'] === 'string' ? payload['first_name'] : undefined;
            const lastName = typeof payload['last_name'] === 'string' ? payload['last_name'] : undefined;
            const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;

            const profile: VerifiedExternalProfile = {
                provider: AuthProvider.TELEGRAM,
                providerUserId: String(telegramId),
                telegramId,
            };
            if (displayName !== undefined) {
                profile.displayName = displayName;
            }
            if (username !== undefined) {
                profile.username = `@${username}`;
            }
            return profile;
        } catch (error) {
            if (error instanceof AuthProviderNotConfiguredError) {
                throw error;
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
    async verify(code: string): Promise<VerifiedExternalProfile> {
        if (
            config.discordClientId === undefined ||
            config.discordClientSecret === undefined ||
            config.discordRedirectUri === undefined
        ) {
            throw new AuthProviderNotConfiguredError(AuthProvider.DISCORD);
        }

        try {
            const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: config.discordClientId,
                    client_secret: config.discordClientSecret,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: config.discordRedirectUri,
                }).toString(),
            });

            if (!tokenResponse.ok) {
                throw new InvalidExternalAuthTokenError(AuthProvider.DISCORD);
            }

            const tokenData = await tokenResponse.json() as { access_token: string };
            const accessToken = tokenData.access_token;
            if (!accessToken) {
                throw new InvalidExternalAuthTokenError(AuthProvider.DISCORD);
            }

            const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!userResponse.ok) {
                throw new InvalidExternalAuthTokenError(AuthProvider.DISCORD);
            }

            const userData = await userResponse.json() as {
                id: string;
                username: string;
                global_name?: string;
                email?: string;
            };

            if (!userData.id) {
                throw new InvalidExternalAuthTokenError(AuthProvider.DISCORD);
            }

            const profile: VerifiedExternalProfile = {
                provider: AuthProvider.DISCORD,
                providerUserId: userData.id,
            };

            if (userData.global_name !== undefined) {
                profile.displayName = userData.global_name;
            } else if (userData.username !== undefined) {
                profile.displayName = userData.username;
            }

            if (userData.email !== undefined) {
                profile.email = userData.email;
            }

            if (userData.username !== undefined) {
                profile.username = userData.username;
            }

            return profile;
        } catch (error) {
            if (
                error instanceof AuthProviderNotConfiguredError ||
                error instanceof InvalidExternalAuthTokenError
            ) {
                throw error;
            }
            throw new InvalidExternalAuthTokenError(AuthProvider.DISCORD);
        }
    }
}

export class DefaultExternalAuthTokenVerifier implements ExternalAuthTokenVerifier {
    private googleVerifier = new GoogleAuthTokenVerifier();
    private telegramVerifier = new TelegramAuthTokenVerifier();
    private discordVerifier = new DiscordAuthTokenVerifier();

    verifyGoogleCredential(credential: string): Promise<VerifiedExternalProfile> {
        return this.googleVerifier.verify(credential);
    }

    verifyTelegramIdToken(idToken: string): Promise<VerifiedExternalProfile> {
        return this.telegramVerifier.verify(idToken);
    }

    verifyDiscordCode(code: string): Promise<VerifiedExternalProfile> {
        return this.discordVerifier.verify(code);
    }
}
