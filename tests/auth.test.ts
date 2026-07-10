import request from 'supertest';
import express from 'express';
import authRoutes, { createAuthRouter } from '../src/routes/AuthRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { HashUtil } from '../src/util/HashUtil.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import config from '../config/config.ts';
import {
    AuthProvider,
    type ExternalAuthFlow,
    type ExternalAuthProviderInput,
    type VerifiedExternalAuth,
    type VerifiedExternalProfile,
} from '../src/model/AuthProviderModels.ts';
import { AuthService } from '../src/service/AuthService.ts';
import { AuthController } from '../src/controller/AuthController.ts';
import { AuthProviderIdentityRepository } from '../src/repository/AuthProviderIdentityRepository.ts';
import { createAuthHeader } from './testHelpers.ts';
import {
    ExternalAuthProviderRegistry,
    TelegramAuthProviderAdapter,
    type ExternalAuthProviderAdapter,
} from '../src/service/ExternalAuthProviderRegistry.ts';
import { hashRegistrationToken } from '../src/service/ExternalAuthRegistrationService.ts';

const app = express();
app.use(express.json());
app.use('/api', authRoutes);
app.use(handleErrors);

class FakeExternalAuthProviderAdapter implements ExternalAuthProviderAdapter {
    readonly flows: ExternalAuthFlow[] = ['BROWSER'];
    readonly provider: AuthProvider;
    private profiles: Record<string, VerifiedExternalProfile>;

    constructor(
        provider: AuthProvider,
        profiles: Record<string, VerifiedExternalProfile>
    ) {
        this.provider = provider;
        this.profiles = profiles;
    }

    isConfigured(): boolean {
        return true;
    }

    async verify(input: ExternalAuthProviderInput): Promise<VerifiedExternalAuth> {
        const token = 'credential' in input
            ? input.credential
            : 'idToken' in input
            ? input.idToken
            : input.code;
        return { profile: this.profiles[token]! };
    }
}

class FakeExternalAuthTokenVerifier extends ExternalAuthProviderRegistry {
    constructor(
        googleProfiles: Record<string, VerifiedExternalProfile>,
        telegramProfiles: Record<string, VerifiedExternalProfile>,
        discordProfiles: Record<string, VerifiedExternalProfile> = {}
    ) {
        super([
            new FakeExternalAuthProviderAdapter(AuthProvider.GOOGLE, googleProfiles),
            new TelegramAuthProviderAdapter({
                verify: async (idToken: string) => telegramProfiles[idToken]!,
            }),
            new FakeExternalAuthProviderAdapter(AuthProvider.DISCORD, discordProfiles),
        ]);
    }
}

function createExternalAuthApp(verifier: ExternalAuthProviderRegistry) {
    const externalAuthApp = express();
    externalAuthApp.use(express.json());
    externalAuthApp.use('/api', createAuthRouter(new AuthController(new AuthService(verifier))));
    externalAuthApp.use(handleErrors);
    return externalAuthApp;
}

describe('Authentication API Endpoints', () => {
    const BOT_TOKEN = config.botToken;
    const TEST_TELEGRAM_ID = 987654321;
    const TEST_USERNAME = 'testuser';
    const userService = new UserService();
    const userRepository = new UserRepository();
    const authProviderIdentityRepository = new AuthProviderIdentityRepository();

    beforeAll(() => {
        // Create test user before running auth tests
        const user = userService.registerUser('name', TEST_USERNAME, TEST_TELEGRAM_ID, 0);
        // Activate the user for tests
        userRepository.updateUserStatus(user.id, true, 'ACTIVE', 0);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    /**
     * Helper function to generate valid Telegram initData
     * Follows the same algorithm as Telegram Mini Apps
     */
    function generateValidInitData(telegramId: number, username: string): Record<string, string> {
        const authDate = Math.floor(Date.now() / 1000);
        const user = JSON.stringify({
            id: telegramId,
            first_name: 'Test',
            last_name: 'User',
            username: username,
            language_code: 'en',
        });

        // Create data-check-string (sorted params except hash)
        const params = {
            auth_date: authDate.toString(),
            user: user,
        };

        const dataCheckString = Object.entries(params)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // Calculate hash using bot token
        const secretKey = HashUtil.hmac(BOT_TOKEN, 'WebAppData');
        const hash = HashUtil.hmac(dataCheckString, secretKey).toString('hex');

        return {
            ...params,
            hash,
        };
    }

    /**
     * Helper function to generate initData with invalid hash
     */
    function generateInvalidInitData(): Record<string, string> {
        const authDate = Math.floor(Date.now() / 1000);
        const user = JSON.stringify({
            id: TEST_TELEGRAM_ID,
            first_name: 'Test',
            username: TEST_USERNAME,
        });

        return {
            auth_date: authDate.toString(),
            user: user,
            hash: 'invalid_hash_value',
        };
    }

    /**
     * Helper function to generate expired initData
     */
    function generateExpiredInitData(): Record<string, string> {
        // Set auth_date to 25 hours ago (beyond default 24 hour validity)
        const authDate = Math.floor(Date.now() / 1000) - (25 * 60 * 60);
        const user = JSON.stringify({
            id: TEST_TELEGRAM_ID,
            first_name: 'Test',
            username: TEST_USERNAME,
        });

        const params = {
            auth_date: authDate.toString(),
            user: user,
        };

        const dataCheckString = Object.entries(params)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        const secretKey = HashUtil.hmac(BOT_TOKEN, 'WebAppData');
        const hash = HashUtil.hmac(dataCheckString, secretKey).toString('hex');

        return {
            ...params,
            hash,
        };
    }

    describe('POST /api/authenticate', () => {
        it('should authenticate an existing user', async () => {
            const initData = generateValidInitData(TEST_TELEGRAM_ID, TEST_USERNAME);

            const response = await request(app)
                .post('/api/authenticate')
                .query(initData)
                .expect(200);

            expect(response.body).toHaveProperty('accessToken');
        });

        it('should reject authentication for non-existent user', async () => {
            const nonExistentTelegramId = 999888777;
            const initData = generateValidInitData(nonExistentTelegramId, 'nonexistent');

            const response = await request(app)
                .post('/api/authenticate')
                .query(initData)
                .expect(404);

            expect(response.body).toHaveProperty('errorCode', 'userNotFoundByTelegramId');
        });

        it('should reject authentication with invalid hash', async () => {
            const initData = generateInvalidInitData();

            const response = await request(app)
                .post('/api/authenticate')
                .query(initData)
                .expect(401);

            expect(response.body).toHaveProperty('errorCode', 'invalidInitData');
            expect(response.body.message).toBe('Невалідні дані автентифікації Telegram: Hash mismatch');
        });

        it('should reject authentication with expired auth_date', async () => {
            const initData = generateExpiredInitData();

            const response = await request(app)
                .post('/api/authenticate')
                .query(initData)
                .expect(401);

            expect(response.body).toHaveProperty('errorCode', 'expiredAuthData');
            expect(response.body.message).toBe(
                'Термін дії даних автентифікації минув. Будь ласка, закрийте та відкрийте додаток заново.'
            );
        });

        it('should reject authentication with missing hash', async () => {
            const authDate = Math.floor(Date.now() / 1000);
            const user = JSON.stringify({
                id: TEST_TELEGRAM_ID,
                username: TEST_USERNAME,
            });

            const response = await request(app)
                .post('/api/authenticate')
                .query({
                    auth_date: authDate.toString(),
                    user: user,
                    // hash is missing
                })
                .expect(401);

            expect(response.body).toHaveProperty('errorCode', 'invalidInitData');
        });

        it('should reject authentication with missing auth_date', async () => {
            const user = JSON.stringify({
                id: TEST_TELEGRAM_ID,
                username: TEST_USERNAME,
            });

            const response = await request(app)
                .post('/api/authenticate')
                .query({
                    user: user,
                    hash: 'some_hash',
                    // auth_date is missing
                })
                .expect(401);

            expect(response.body).toHaveProperty('errorCode', 'invalidInitData');
        });

        it('should reject authentication for inactive user', async () => {
            const inactiveTelegramId = 777888999;
            // Create an inactive user
            const user = userService.registerUser('inactive_name', 'inactiveuser', inactiveTelegramId, 0);
            userRepository.updateUserStatus(user.id, false, 'INACTIVE', 0);
            const initData = generateValidInitData(inactiveTelegramId, 'inactiveuser');

            const response = await request(app)
                .post('/api/authenticate')
                .query(initData)
                .expect(403);

            expect(response.body).toHaveProperty('errorCode', 'userIsNotActive');
        });
    });

    describe('external browser auth', () => {
        it('supports a LINE-like adapter without provider-specific AuthService methods', async () => {
            const lineProvider = 'LINE' as AuthProvider;
            dbManager.db.prepare("INSERT INTO authProvider (provider) VALUES ('LINE')").run();
            const registry = new ExternalAuthProviderRegistry([
                new FakeExternalAuthProviderAdapter(lineProvider, {
                    'line-token': {
                        provider: lineProvider,
                        providerUserId: 'line-user',
                        displayName: 'LINE User',
                    },
                }),
            ]);

            try {
                const result = await new AuthService(registry).authenticateExternal(
                    lineProvider,
                    { credential: 'line-token' }
                );

                expect(result).toMatchObject({
                    registrationRequired: true,
                    provider: 'LINE',
                    suggestedName: 'LINE User',
                });
            } finally {
                dbManager.db.prepare("DELETE FROM pendingExternalAuthRegistration WHERE provider = 'LINE'").run();
                dbManager.db.prepare("DELETE FROM authProvider WHERE provider = 'LINE'").run();
            }
        });

        it('lists configured auth providers without authentication', async () => {
            const externalAuthApp = createExternalAuthApp(new FakeExternalAuthTokenVerifier({}, {}));

            const response = await request(externalAuthApp)
                .get('/api/auth/providers/available')
                .expect(200);

            expect(response.body).toEqual([
                { provider: 'GOOGLE', flows: ['BROWSER'] },
                { provider: 'DISCORD', flows: ['BROWSER'] },
            ]);
        });

        it('authenticates an existing Google identity', async () => {
            const user = userService.registerUser('Existing Google User', undefined, undefined, 0);
            authProviderIdentityRepository.createIdentity(user.id, {
                provider: AuthProvider.GOOGLE,
                providerUserId: 'google-existing',
                displayName: 'Existing Google User',
                email: 'existing@example.com',
            });
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-existing-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-existing',
                        displayName: 'Existing Google User',
                        email: 'existing@example.com',
                    },
                }, {})
            );

            const response = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-existing-token' })
                .expect(200);

            expect(response.body).toHaveProperty('accessToken');
        });

        it('requires explicit registration for an unknown Google identity', async () => {
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-new-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-new',
                        displayName: 'Google New',
                        email: 'new@example.com',
                    },
                }, {})
            );

            const response = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-new-token' })
                .expect(200);

            expect(response.body).toEqual({
                registrationRequired: true,
                registrationToken: expect.any(String),
                provider: 'GOOGLE',
                suggestedName: 'Google New',
                profile: {
                    displayName: 'Google New',
                    email: 'new@example.com',
                    username: null,
                },
            });
        });

        it('creates a Google-only user after explicit registration', async () => {
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-register-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-register',
                        displayName: 'Google Registered',
                        email: 'registered@example.com',
                    },
                }, {})
            );

            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-register-token' })
                .expect(200);
            const response = await request(externalAuthApp)
                .post('/api/auth/register')
                .send({
                    registrationToken: authResponse.body.registrationToken,
                    name: 'Google Registered',
                })
                .expect(200);

            const user = userRepository.findUserByName('Google Registered')!;
            const identity = authProviderIdentityRepository.findIdentity(AuthProvider.GOOGLE, 'google-register')!;
            expect(response.body).toHaveProperty('accessToken');
            expect(user.telegramId).toBeNull();
            expect(identity.userId).toBe(user.id);
            expect(identity.email).toBe('registered@example.com');
        });

        it('stores only a hash of the registration token', async () => {
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-hashed-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-hashed',
                        displayName: 'Google Hashed',
                    },
                }, {})
            );

            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-hashed-token' })
                .expect(200);
            const registrationToken = authResponse.body.registrationToken as string;
            const stored = dbManager.db.prepare(`
                SELECT tokenHash
                FROM pendingExternalAuthRegistration
                WHERE provider = 'GOOGLE' AND providerUserId = 'google-hashed'`).get() as { tokenHash: string };

            expect(stored.tokenHash).toBe(hashRegistrationToken(registrationToken));
            expect(stored.tokenHash).not.toContain(registrationToken);
        });

        it('keeps a registration token usable after a name conflict and consumes it once on success', async () => {
            userService.registerUser('Registration Name Collision', undefined, undefined, 0);
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-registration-retry': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-registration-retry',
                        displayName: 'Registration Retry',
                    },
                }, {})
            );
            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-registration-retry' })
                .expect(200);
            const registrationToken = authResponse.body.registrationToken as string;

            await request(externalAuthApp)
                .post('/api/auth/register')
                .send({ registrationToken, name: 'Registration Name Collision' })
                .expect(400);
            await request(externalAuthApp)
                .post('/api/auth/register')
                .send({ registrationToken, name: 'Registration Retry Success' })
                .expect(200);
            const consumedResponse = await request(externalAuthApp)
                .post('/api/auth/register')
                .send({ registrationToken, name: 'Cannot Reuse Registration' })
                .expect(401);

            expect(consumedResponse.body.errorCode).toBe('invalidExternalAuthRegistrationToken');
        });

        it('rejects expired and malformed registration tokens', async () => {
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-expired-registration': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-expired-registration',
                    },
                }, {})
            );
            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-expired-registration' })
                .expect(200);
            const registrationToken = authResponse.body.registrationToken as string;
            dbManager.db.prepare(`
                UPDATE pendingExternalAuthRegistration
                SET expiresAt = :expiresAt
                WHERE tokenHash = :tokenHash`).run({
                expiresAt: new Date(0).toISOString(),
                tokenHash: hashRegistrationToken(registrationToken),
            });

            await request(externalAuthApp)
                .post('/api/auth/register')
                .send({ registrationToken, name: 'Expired Registration' })
                .expect(401);
            await request(externalAuthApp)
                .post('/api/auth/register')
                .send({ registrationToken: 'not-a-real-token', name: 'Malformed Registration' })
                .expect(401);
        });

        it('rejects registration when the provider identity was linked concurrently', async () => {
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-registration-race': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-registration-race',
                    },
                }, {})
            );
            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-registration-race' })
                .expect(200);
            const linkedUser = userService.registerUser('Concurrent Linked User', undefined, undefined, 0);
            authProviderIdentityRepository.createIdentity(linkedUser.id, {
                provider: AuthProvider.GOOGLE,
                providerUserId: 'google-registration-race',
            });

            const response = await request(externalAuthApp)
                .post('/api/auth/register')
                .send({
                    registrationToken: authResponse.body.registrationToken,
                    name: 'Concurrent Registration',
                })
                .expect(409);

            expect(response.body.errorCode).toBe('authProviderIdentityAlreadyLinked');
            expect(userRepository.findUserByName('Concurrent Registration')).toBeUndefined();
        });

        it('does not auto-link Google users by display name or email', async () => {
            userService.registerUser('Existing Display Name', undefined, undefined, 0);
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-name-collision-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-name-collision',
                        displayName: 'Existing Display Name',
                        email: 'existing-name@example.com',
                    },
                }, {})
            );

            const response = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-name-collision-token' })
                .expect(200);

            expect(response.body).toHaveProperty('registrationRequired', true);
            expect(authProviderIdentityRepository.findIdentity(AuthProvider.GOOGLE, 'google-name-collision'))
                .toBeUndefined();
        });

        it('backfills and authenticates an existing Telegram user by telegramId', async () => {
            const legacyUser = userService.registerUser('Legacy Telegram User', 'legacy_telegram', 888777666, 0);
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({}, {
                    'telegram-legacy-token': {
                        provider: AuthProvider.TELEGRAM,
                        providerUserId: '888777666',
                        telegramId: 888777666,
                        displayName: 'Legacy Telegram User',
                        username: '@legacy_telegram',
                    },
                })
            );

            const response = await request(externalAuthApp)
                .post('/api/auth/telegram')
                .send({ idToken: 'telegram-legacy-token' })
                .expect(200);

            const identity = authProviderIdentityRepository.findIdentity(AuthProvider.TELEGRAM, '888777666')!;
            expect(response.body).toHaveProperty('accessToken');
            expect(identity.userId).toBe(legacyUser.id);
        });

        it('creates an unknown Telegram user with telegramId for notifications', async () => {
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({}, {
                    'telegram-new-token': {
                        provider: AuthProvider.TELEGRAM,
                        providerUserId: '998877665',
                        telegramId: 998877665,
                        displayName: 'Telegram New',
                        username: '@telegram_new',
                    },
                })
            );

            const authResponse = await request(externalAuthApp)
                .post('/api/auth/telegram')
                .send({ idToken: 'telegram-new-token' })
                .expect(200);
            const response = await request(externalAuthApp)
                .post('/api/auth/register')
                .send({
                    registrationToken: authResponse.body.registrationToken,
                    name: 'Telegram New',
                })
                .expect(200);

            const user = userRepository.findUserByName('Telegram New')!;
            expect(response.body).toHaveProperty('accessToken');
            expect(user.telegramId).toBe(998877665);
            expect(user.telegramUsername).toBe('@telegram_new');
        });

        it('rejects login for an inactive linked user', async () => {
            const user = userService.registerUser('Inactive Google User', undefined, undefined, 0);
            userRepository.updateUserStatus(user.id, false, 'INACTIVE', 0);
            authProviderIdentityRepository.createIdentity(user.id, {
                provider: AuthProvider.GOOGLE,
                providerUserId: 'google-inactive',
                displayName: 'Inactive Google User',
            });
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-inactive-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-inactive',
                        displayName: 'Inactive Google User',
                    },
                }, {})
            );

            const response = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-inactive-token' })
                .expect(403);

            expect(response.body).toHaveProperty('errorCode', 'userIsNotActive');
        });

        it('links Google for the current user and lists providers without provider ids', async () => {
            const user = userService.registerUser('Link Google User', undefined, undefined, 0);
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-link-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-link',
                        displayName: 'Link Google User',
                        email: 'link@example.com',
                    },
                }, {})
            );

            const linkResponse = await request(externalAuthApp)
                .post('/api/auth/link/google')
                .set('Authorization', createAuthHeader(user.id))
                .send({ credential: 'google-link-token' })
                .expect(200);
            const providersResponse = await request(externalAuthApp)
                .get('/api/auth/providers')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);

            expect(linkResponse.body).toEqual({
                provider: 'GOOGLE',
                displayName: 'Link Google User',
                email: 'link@example.com',
                username: null,
                linkedAt: expect.any(String),
            });
            expect(providersResponse.body).toEqual([linkResponse.body]);
            expect(JSON.stringify(providersResponse.body)).not.toContain('google-link');
        });

        it('rejects linking a provider identity already linked to another user', async () => {
            const owner = userService.registerUser('Provider Owner', undefined, undefined, 0);
            const target = userService.registerUser('Provider Target', undefined, undefined, 0);
            authProviderIdentityRepository.createIdentity(owner.id, {
                provider: AuthProvider.GOOGLE,
                providerUserId: 'google-owned',
                displayName: 'Provider Owner',
            });
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-owned-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-owned',
                        displayName: 'Provider Owner',
                    },
                }, {})
            );

            const response = await request(externalAuthApp)
                .post('/api/auth/link/google')
                .set('Authorization', createAuthHeader(target.id))
                .send({ credential: 'google-owned-token' })
                .expect(409);

            expect(response.body).toHaveProperty('errorCode', 'authProviderIdentityAlreadyLinked');
        });

        it('authenticates an existing Discord identity', async () => {
            const user = userService.registerUser('Existing Discord User', undefined, undefined, 0);
            authProviderIdentityRepository.createIdentity(user.id, {
                provider: AuthProvider.DISCORD,
                providerUserId: 'discord-existing',
                displayName: 'Existing Discord User',
            });
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({}, {}, {
                    'discord-existing-code': {
                        provider: AuthProvider.DISCORD,
                        providerUserId: 'discord-existing',
                        displayName: 'Existing Discord User',
                    },
                })
            );

            const response = await request(externalAuthApp)
                .post('/api/auth/discord')
                .send({ code: 'discord-existing-code' })
                .expect(200);

            expect(response.body).toHaveProperty('accessToken');
        });

        it('requires explicit registration for an unknown Discord identity', async () => {
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({}, {}, {
                    'discord-new-code': {
                        provider: AuthProvider.DISCORD,
                        providerUserId: 'discord-new',
                        displayName: 'Discord New',
                    },
                })
            );

            const response = await request(externalAuthApp)
                .post('/api/auth/discord')
                .send({ code: 'discord-new-code' })
                .expect(200);

            expect(response.body).toEqual({
                registrationRequired: true,
                registrationToken: expect.any(String),
                provider: 'DISCORD',
                suggestedName: 'Discord New',
                profile: {
                    displayName: 'Discord New',
                    email: null,
                    username: null,
                },
            });
        });

        it('creates a Discord-only user after explicit registration', async () => {
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({}, {}, {
                    'discord-register-code': {
                        provider: AuthProvider.DISCORD,
                        providerUserId: 'discord-register',
                        displayName: 'Discord Registered',
                    },
                })
            );

            const authResponse = await request(externalAuthApp)
                .post('/api/auth/discord')
                .send({ code: 'discord-register-code' })
                .expect(200);
            const response = await request(externalAuthApp)
                .post('/api/auth/register')
                .send({
                    registrationToken: authResponse.body.registrationToken,
                    name: 'Discord Registered',
                })
                .expect(200);

            const user = userRepository.findUserByName('Discord Registered')!;
            const identity = authProviderIdentityRepository.findIdentity(AuthProvider.DISCORD, 'discord-register')!;
            expect(response.body).toHaveProperty('accessToken');
            expect(user.telegramId).toBeNull();
            expect(identity.userId).toBe(user.id);
        });

        it('links Discord for the current user', async () => {
            const user = userService.registerUser('Link Discord User', undefined, undefined, 0);
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({}, {}, {
                    'discord-link-code': {
                        provider: AuthProvider.DISCORD,
                        providerUserId: 'discord-link',
                        displayName: 'Link Discord User',
                    },
                })
            );

            const linkResponse = await request(externalAuthApp)
                .post('/api/auth/link/discord')
                .set('Authorization', createAuthHeader(user.id))
                .send({ code: 'discord-link-code' })
                .expect(200);

            expect(linkResponse.body).toEqual({
                provider: 'DISCORD',
                displayName: 'Link Discord User',
                email: null,
                username: null,
                linkedAt: expect.any(String),
            });
        });
    });
});
