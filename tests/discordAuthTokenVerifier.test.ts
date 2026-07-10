import { jest } from '@jest/globals';
import config, { validateOptionalConfigGroup } from '../config/config.ts';
import { DiscordAuthTokenVerifier } from '../src/service/ExternalAuthTokenVerifier.ts';

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('DiscordAuthTokenVerifier', () => {
    const originalConfig = {
        clientId: config.discordClientId,
        clientSecret: config.discordClientSecret,
        redirectUri: config.discordBrowserRedirectUri,
    };

    beforeEach(() => {
        config.discordClientId = 'discord-client';
        config.discordClientSecret = 'discord-secret';
        config.discordBrowserRedirectUri = 'https://app.example.com/auth/discord/callback';
    });

    afterAll(() => {
        config.discordClientId = originalConfig.clientId;
        config.discordClientSecret = originalConfig.clientSecret;
        config.discordBrowserRedirectUri = originalConfig.redirectUri;
    });

    it('exchanges a browser code with PKCE and the configured redirect URI', async () => {
        const fetchMock = jest.fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'browser-access', expires_in: 3600 }))
            .mockResolvedValueOnce(jsonResponse(200, {
                id: '123456789012345678',
                username: 'discord_user',
                global_name: 'Discord User',
            }));
        const verifier = new DiscordAuthTokenVerifier(fetchMock);

        const result = await verifier.verify({
            flow: 'BROWSER',
            code: 'browser-code',
            codeVerifier: 'a'.repeat(43),
        });

        const tokenRequest = new URLSearchParams(fetchMock.mock.calls[0]![1]!.body as string);
        expect(Object.fromEntries(tokenRequest)).toEqual({
            client_id: 'discord-client',
            client_secret: 'discord-secret',
            grant_type: 'authorization_code',
            code: 'browser-code',
            redirect_uri: 'https://app.example.com/auth/discord/callback',
            code_verifier: 'a'.repeat(43),
        });
        expect(fetchMock.mock.calls[1]![1]!.headers).toEqual({ Authorization: 'Bearer browser-access' });
        expect(result).toEqual({
            profile: {
                provider: 'DISCORD',
                providerUserId: '123456789012345678',
                displayName: 'Discord User',
                username: 'discord_user',
            },
        });
    });

    it('returns a transient provider session for Activity authentication', async () => {
        const fetchMock = jest.fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'activity-access', expires_in: 7200 }))
            .mockResolvedValueOnce(jsonResponse(200, {
                id: '987654321098765432',
                username: 'activity_user',
                global_name: null,
            }));
        const verifier = new DiscordAuthTokenVerifier(fetchMock);

        const result = await verifier.verify({ flow: 'ACTIVITY', code: 'activity-code' });

        const tokenRequest = new URLSearchParams(fetchMock.mock.calls[0]![1]!.body as string);
        expect(tokenRequest.has('redirect_uri')).toBe(false);
        expect(tokenRequest.has('code_verifier')).toBe(false);
        expect(result).toEqual({
            profile: {
                provider: 'DISCORD',
                providerUserId: '987654321098765432',
                displayName: 'activity_user',
                username: 'activity_user',
            },
            providerSession: {
                provider: 'DISCORD',
                accessToken: 'activity-access',
                expiresIn: 7200,
            },
        });
    });

    it.each([400, 401])('maps Discord %i responses to invalid credentials', async status => {
        const fetchMock = jest.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(status, {}));

        await expect(new DiscordAuthTokenVerifier(fetchMock).verify({
            flow: 'ACTIVITY',
            code: 'invalid-code',
        })).rejects.toMatchObject({ statusCode: 401, errorCode: 'invalidExternalAuthToken' });
    });

    it.each([429, 500, 503])('maps Discord %i responses to provider unavailable', async status => {
        const fetchMock = jest.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(status, {}));

        await expect(new DiscordAuthTokenVerifier(fetchMock).verify({
            flow: 'ACTIVITY',
            code: 'unavailable-code',
        })).rejects.toMatchObject({ statusCode: 503, errorCode: 'externalAuthProviderUnavailable' });
    });

    it('maps Discord network failures to provider unavailable', async () => {
        const fetchMock = jest.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('fetch failed'));

        await expect(new DiscordAuthTokenVerifier(fetchMock).verify({
            flow: 'ACTIVITY',
            code: 'network-code',
        })).rejects.toMatchObject({ statusCode: 503, errorCode: 'externalAuthProviderUnavailable' });
    });
});

describe('Discord configuration', () => {
    it('rejects a partially configured Discord provider', () => {
        expect(() =>
            validateOptionalConfigGroup('Discord', {
                DISCORD_CLIENT_ID: 'client',
                DISCORD_CLIENT_SECRET: undefined,
                DISCORD_BROWSER_REDIRECT_URI: undefined,
            })
        ).toThrow('Discord configuration is incomplete');
    });

    it('accepts a fully configured or disabled Discord provider', () => {
        expect(() =>
            validateOptionalConfigGroup('Discord', {
                DISCORD_CLIENT_ID: 'client',
                DISCORD_CLIENT_SECRET: 'secret',
                DISCORD_BROWSER_REDIRECT_URI: 'https://app.example.com/callback',
            })
        ).not.toThrow();
        expect(() =>
            validateOptionalConfigGroup('Discord', {
                DISCORD_CLIENT_ID: undefined,
                DISCORD_CLIENT_SECRET: undefined,
                DISCORD_BROWSER_REDIRECT_URI: undefined,
            })
        ).not.toThrow();
    });

    it('treats blank Discord configuration values as missing', () => {
        expect(() =>
            validateOptionalConfigGroup('Discord', {
                DISCORD_CLIENT_ID: 'client',
                DISCORD_CLIENT_SECRET: '   ',
                DISCORD_BROWSER_REDIRECT_URI: undefined,
            })
        ).toThrow('Discord configuration is incomplete');
    });
});
