import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import config from '../config/config.ts';
import { TelegramAuthTokenVerifier } from '../src/service/ExternalAuthTokenVerifier.ts';

describe('TelegramAuthTokenVerifier', () => {
    const originalClientId = config.telegramLoginClientId;

    beforeEach(() => {
        config.telegramLoginClientId = 'telegram-test-client';
    });

    afterAll(() => {
        config.telegramLoginClientId = originalClientId;
    });

    it('maps the current Telegram OIDC profile claims', async () => {
        const { privateKey, publicKey } = await generateKeyPair('RS256');
        const publicJwk = await exportJWK(publicKey);
        publicJwk.kid = 'telegram-test-key';
        publicJwk.alg = 'RS256';
        const jwks: JSONWebKeySet = { keys: [publicJwk] };
        const idToken = await new SignJWT({
            id: '123456789',
            preferred_username: 'dojo_player',
            name: 'Dojo Player',
            given_name: 'Dojo',
            family_name: 'Player',
        })
            .setProtectedHeader({ alg: 'RS256', kid: 'telegram-test-key' })
            .setIssuer('https://oauth.telegram.org')
            .setAudience('telegram-test-client')
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(privateKey);

        const profile = await new TelegramAuthTokenVerifier(createLocalJWKSet(jwks)).verify(idToken);

        expect(profile).toEqual({
            provider: 'TELEGRAM',
            providerUserId: '123456789',
            telegramId: 123456789,
            displayName: 'Dojo Player',
            username: '@dojo_player',
        });
    });

    it('returns 503 when Telegram key discovery is unavailable', async () => {
        const { privateKey } = await generateKeyPair('RS256');
        const idToken = await new SignJWT({ id: '123456789' })
            .setProtectedHeader({ alg: 'RS256', kid: 'unavailable-key' })
            .setIssuer('https://oauth.telegram.org')
            .setAudience('telegram-test-client')
            .setExpirationTime('5m')
            .sign(privateKey);
        const unavailableKeySet = async () => {
            const error = new Error('timed out') as Error & { code: string };
            error.code = 'ETIMEDOUT';
            throw error;
        };

        await expect(new TelegramAuthTokenVerifier(unavailableKeySet).verify(idToken))
            .rejects.toMatchObject({
                statusCode: 503,
                errorCode: 'externalAuthProviderUnavailable',
            });
    });

    it('returns 401 for an invalid Telegram token', async () => {
        const { publicKey } = await generateKeyPair('RS256');
        const publicJwk = await exportJWK(publicKey);
        publicJwk.kid = 'telegram-test-key';
        const jwks: JSONWebKeySet = { keys: [publicJwk] };

        await expect(new TelegramAuthTokenVerifier(createLocalJWKSet(jwks)).verify('invalid-token'))
            .rejects.toMatchObject({
                statusCode: 401,
                errorCode: 'invalidExternalAuthToken',
            });
    });
});
