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
import { AuthLinkCodeService, hashLinkCode } from '../src/service/AuthLinkCodeService.ts';

const app = express();
app.use(express.json());
app.use('/api', authRoutes);
app.use(handleErrors);

class FakeExternalAuthProviderAdapter implements ExternalAuthProviderAdapter {
    readonly flows: ExternalAuthFlow[];
    readonly provider: AuthProvider;
    private profiles: Record<string, VerifiedExternalProfile>;

    constructor(
        provider: AuthProvider,
        profiles: Record<string, VerifiedExternalProfile>,
        flows: ExternalAuthFlow[] = ['BROWSER']
    ) {
        this.provider = provider;
        this.profiles = profiles;
        this.flows = flows;
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
        const result: VerifiedExternalAuth = { profile: this.profiles[token]! };
        if (this.provider === AuthProvider.DISCORD && 'flow' in input && input.flow === 'ACTIVITY') {
            result.providerSession = {
                provider: AuthProvider.DISCORD,
                accessToken: `discord-access-${token}`,
                expiresIn: 3600,
            };
        }
        return result;
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
            new FakeExternalAuthProviderAdapter(
                AuthProvider.DISCORD,
                discordProfiles,
                ['BROWSER', 'ACTIVITY']
            ),
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
        const user = userService.registerUser('name', '@auth_test_user', TEST_USERNAME, TEST_TELEGRAM_ID, 0);
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

        it('should return a registration continuation for a non-existent user', async () => {
            const nonExistentTelegramId = 999888777;
            const initData = generateValidInitData(nonExistentTelegramId, 'nonexistent');

            const response = await request(app)
                .post('/api/authenticate')
                .query(initData)
                .expect(200);

            expect(response.body).toMatchObject({
                registrationRequired: true,
                provider: AuthProvider.TELEGRAM,
                suggestedName: 'Test User',
                suggestedNickname: '@nonexistent',
            });
            expect(response.body.registrationToken).toEqual(expect.any(String));
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
            const user = userService.registerUser(
                'inactive_name',
                '@inactive_auth_user',
                'inactiveuser',
                inactiveTelegramId,
                0
            );
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
                { provider: 'DISCORD', flows: ['BROWSER', 'ACTIVITY'] },
            ]);
        });

        it('authenticates an existing Google identity', async () => {
            const user = userService.registerUser('Existing Google User', '@existing_google', undefined, undefined, 0);
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
                suggestedNickname: expect.stringMatching(/^@[A-Za-z0-9_]{3,32}$/),
                provider: 'GOOGLE',
                suggestedName: 'Google New',
                profile: {
                    displayName: 'Google New',
                    email: 'new@example.com',
                    username: null,
                },
            });
        });

        it('normalizes a provider username into the suggested nickname', async () => {
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-username-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-username',
                        username: 'ihor.k',
                    },
                }, {})
            );

            const response = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-username-token' })
                .expect(200);

            expect(response.body.suggestedNickname).toBe('@ihor_k');
        });

        it('keeps the registration token after a nickname tripwire conflict without revealing account data', async () => {
            userService.registerUser('Nickname Owner', '@nickname_tripwire', undefined, undefined, 0);
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'google-nickname-tripwire': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-nickname-tripwire',
                    },
                }, {})
            );
            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'google-nickname-tripwire' })
                .expect(200);
            const registrationToken = authResponse.body.registrationToken as string;

            const conflict = await request(externalAuthApp)
                .post('/api/auth/register')
                .send({
                    registrationToken,
                    name: 'Nickname Claim Candidate',
                    nickname: '@NICKNAME_TRIPWIRE',
                })
                .expect(400);
            expect(conflict.body.errorCode).toBe('nicknameAlreadyTaken');
            expect(JSON.stringify(conflict.body)).not.toContain('Nickname Owner');

            await request(externalAuthApp)
                .post('/api/auth/register')
                .send({
                    registrationToken,
                    name: 'Nickname Claim Candidate',
                    nickname: '@nickname_tripwire_retry',
                })
                .expect(200);
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
                    nickname: '@google_registered',
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
            userService.registerUser('Registration Name Collision', '@registration_collision', undefined, undefined, 0);
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
                .send({
                    registrationToken,
                    name: 'Registration Name Collision',
                    nickname: '@registration_retry',
                })
                .expect(400);
            await request(externalAuthApp)
                .post('/api/auth/register')
                .send({ registrationToken, name: 'Registration Retry Success', nickname: '@registration_retry' })
                .expect(200);
            const consumedResponse = await request(externalAuthApp)
                .post('/api/auth/register')
                .send({ registrationToken, name: 'Cannot Reuse Registration', nickname: '@cannot_reuse' })
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
                .send({ registrationToken, name: 'Expired Registration', nickname: '@expired_registration' })
                .expect(401);
            await request(externalAuthApp)
                .post('/api/auth/register')
                .send({
                    registrationToken: 'not-a-real-token',
                    name: 'Malformed Registration',
                    nickname: '@malformed_registration',
                })
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
            const linkedUser = userService.registerUser(
                'Concurrent Linked User',
                '@concurrent_linked',
                undefined,
                undefined,
                0
            );
            authProviderIdentityRepository.createIdentity(linkedUser.id, {
                provider: AuthProvider.GOOGLE,
                providerUserId: 'google-registration-race',
            });

            const response = await request(externalAuthApp)
                .post('/api/auth/register')
                .send({
                    registrationToken: authResponse.body.registrationToken,
                    name: 'Concurrent Registration',
                    nickname: '@concurrent_registration',
                })
                .expect(409);

            expect(response.body.errorCode).toBe('authProviderIdentityAlreadyLinked');
            expect(userRepository.findUserByName('Concurrent Registration')).toBeUndefined();
        });

        it('does not auto-link Google users by display name or email', async () => {
            userService.registerUser('Existing Display Name', '@existing_display', undefined, undefined, 0);
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
            const legacyUser = userService.registerUser(
                'Legacy Telegram User',
                '@legacy_telegram',
                'legacy_telegram',
                888777666,
                0
            );
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
                    nickname: '@telegram_new',
                })
                .expect(200);

            const user = userRepository.findUserByName('Telegram New')!;
            expect(response.body).toHaveProperty('accessToken');
            expect(user.telegramId).toBe(998877665);
            expect(user.telegramUsername).toBe('@telegram_new');
        });

        it('rejects login for an inactive linked user', async () => {
            const user = userService.registerUser('Inactive Google User', '@inactive_google', undefined, undefined, 0);
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
            const user = userService.registerUser('Link Google User', '@link_google', undefined, undefined, 0);
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
            const owner = userService.registerUser('Provider Owner', '@provider_owner', undefined, undefined, 0);
            const target = userService.registerUser('Provider Target', '@provider_target', undefined, undefined, 0);
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
            const user = userService.registerUser(
                'Existing Discord User',
                '@existing_discord',
                undefined,
                undefined,
                0
            );
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
                .send({
                    flow: 'BROWSER',
                    code: 'discord-existing-code',
                    codeVerifier: 'a'.repeat(43),
                })
                .expect(200);

            expect(response.body).toHaveProperty('accessToken');
            expect(response.body).not.toHaveProperty('providerSession');
        });

        it('rejects an invalid Discord browser PKCE verifier', async () => {
            const externalAuthApp = createExternalAuthApp(new FakeExternalAuthTokenVerifier({}, {}, {}));

            await request(externalAuthApp)
                .post('/api/auth/discord')
                .send({
                    flow: 'BROWSER',
                    code: 'discord-browser-code',
                    codeVerifier: '*'.repeat(43),
                })
                .expect(400);
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
                .send({ flow: 'ACTIVITY', code: 'discord-new-code' })
                .expect(200);

            expect(response.body).toEqual({
                registrationRequired: true,
                registrationToken: expect.any(String),
                suggestedNickname: expect.stringMatching(/^@[A-Za-z0-9_]{3,32}$/),
                provider: 'DISCORD',
                suggestedName: 'Discord New',
                profile: {
                    displayName: 'Discord New',
                    email: null,
                    username: null,
                },
                providerSession: {
                    provider: 'DISCORD',
                    accessToken: 'discord-access-discord-new-code',
                    expiresIn: 3600,
                },
            });
            const pendingProfile = dbManager.db.prepare(`
                SELECT profileJson
                FROM pendingExternalAuthRegistration
                WHERE provider = 'DISCORD' AND providerUserId = 'discord-new'`).get() as { profileJson: string };
            expect(pendingProfile.profileJson).not.toContain('discord-access-discord-new-code');
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
                .send({ flow: 'ACTIVITY', code: 'discord-register-code' })
                .expect(200);
            const response = await request(externalAuthApp)
                .post('/api/auth/register')
                .send({
                    registrationToken: authResponse.body.registrationToken,
                    name: 'Discord Registered',
                    nickname: '@discord_registered',
                })
                .expect(200);

            const user = userRepository.findUserByName('Discord Registered')!;
            const identity = authProviderIdentityRepository.findIdentity(AuthProvider.DISCORD, 'discord-register')!;
            expect(response.body).toHaveProperty('accessToken');
            expect(user.telegramId).toBeNull();
            expect(identity.userId).toBe(user.id);
        });

        it('links Discord for the current user', async () => {
            const user = userService.registerUser('Link Discord User', '@link_discord', undefined, undefined, 0);
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
                .send({ flow: 'ACTIVITY', code: 'discord-link-code' })
                .expect(200);

            expect(linkResponse.body).toEqual({
                provider: 'DISCORD',
                displayName: 'Link Discord User',
                email: null,
                username: null,
                linkedAt: expect.any(String),
                providerSession: {
                    provider: 'DISCORD',
                    accessToken: 'discord-access-discord-link-code',
                    expiresIn: 3600,
                },
            });
        });
    });

    describe('account claim flow', () => {
        it('creates a hashed, expiring code and invalidates the previous code', async () => {
            const user = userService.registerUser('Link Code Owner', '@link_code_owner', undefined, undefined, 0);

            const first = await request(app)
                .post('/api/auth/link-code')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);
            const second = await request(app)
                .post('/api/auth/link-code')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);
            const stored = dbManager.db.prepare(
                'SELECT codeHash, expiresAt FROM authLinkCode WHERE userId = ?'
            ).get(user.id) as { codeHash: string, expiresAt: string };

            expect(first.body.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
            expect(second.body.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
            expect(stored.codeHash).toBe(hashLinkCode(second.body.code));
            expect(stored.codeHash).not.toContain(second.body.code);
            expect(new Date(stored.expiresAt).getTime()).toBeGreaterThan(Date.now());
            expect(() => new AuthLinkCodeService().resolve(first.body.code)).toThrow();
        });

        it('claims an unknown identity using authenticated proof', async () => {
            const user = userService.registerUser('Bearer Claim Owner', '@bearer_claim_owner', undefined, undefined, 0);
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'bearer-claim-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-bearer-claim',
                    },
                }, {})
            );
            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'bearer-claim-token' })
                .expect(200);

            const claimResponse = await request(externalAuthApp)
                .post('/api/auth/claim')
                .set('Authorization', createAuthHeader(user.id))
                .send({ registrationToken: authResponse.body.registrationToken })
                .expect(200);

            expect(claimResponse.body).toHaveProperty('accessToken');
            expect(authProviderIdentityRepository.findIdentity(AuthProvider.GOOGLE, 'google-bearer-claim')?.userId)
                .toBe(user.id);
            expect(
                dbManager.db.prepare(
                    'SELECT 1 FROM pendingExternalAuthRegistration WHERE tokenHash = ?'
                ).get(hashRegistrationToken(authResponse.body.registrationToken))
            ).toBeUndefined();
        });

        it('claims an unknown identity with a case-insensitive link code and consumes both proofs', async () => {
            const user = userService.registerUser('Code Claim Owner', '@code_claim_owner', undefined, undefined, 0);
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'code-claim-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-code-claim',
                    },
                }, {})
            );
            const codeResponse = await request(externalAuthApp)
                .post('/api/auth/link-code')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);
            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'code-claim-token' })
                .expect(200);

            await request(externalAuthApp)
                .post('/api/auth/claim')
                .send({
                    registrationToken: authResponse.body.registrationToken,
                    linkCode: (codeResponse.body.code as string).toLowerCase(),
                })
                .expect(200);

            expect(authProviderIdentityRepository.findIdentity(AuthProvider.GOOGLE, 'google-code-claim')?.userId)
                .toBe(user.id);
            expect(dbManager.db.prepare('SELECT 1 FROM authLinkCode WHERE userId = ?').get(user.id)).toBeUndefined();
            await request(externalAuthApp)
                .post('/api/auth/claim')
                .send({
                    registrationToken: authResponse.body.registrationToken,
                    linkCode: codeResponse.body.code,
                })
                .expect(401);
        });

        it('requires exactly one claim proof and validates optional authorization strictly', async () => {
            const user = userService.registerUser('Claim Proof Owner', '@claim_proof_owner', undefined, undefined, 0);
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'proof-claim-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-proof-claim',
                    },
                }, {})
            );
            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'proof-claim-token' })
                .expect(200);
            const codeResponse = await request(externalAuthApp)
                .post('/api/auth/link-code')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);

            const missing = await request(externalAuthApp)
                .post('/api/auth/claim')
                .send({ registrationToken: authResponse.body.registrationToken })
                .expect(400);
            const duplicate = await request(externalAuthApp)
                .post('/api/auth/claim')
                .set('Authorization', createAuthHeader(user.id))
                .send({
                    registrationToken: authResponse.body.registrationToken,
                    linkCode: codeResponse.body.code,
                })
                .expect(400);
            const malformedHeader = await request(externalAuthApp)
                .post('/api/auth/claim')
                .set('Authorization', 'not-a-bearer-token')
                .send({
                    registrationToken: authResponse.body.registrationToken,
                    linkCode: codeResponse.body.code,
                })
                .expect(401);

            expect(missing.body.errorCode).toBe('claimProofRequired');
            expect(duplicate.body.errorCode).toBe('claimProofRequired');
            expect(malformedHeader.body.errorCode).toBe('invalidAuthToken');
        });

        it('rejects wrong, expired, and inactive-user link codes', async () => {
            const user = userService.registerUser('Invalid Code Owner', '@invalid_code_owner', undefined, undefined, 0);
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'invalid-code-claim-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-invalid-code-claim',
                    },
                }, {})
            );
            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'invalid-code-claim-token' })
                .expect(200);
            const codeResponse = await request(externalAuthApp)
                .post('/api/auth/link-code')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);

            await request(externalAuthApp)
                .post('/api/auth/claim')
                .send({ registrationToken: authResponse.body.registrationToken, linkCode: 'AAAAAAAA' })
                .expect(401);
            dbManager.db.prepare('UPDATE authLinkCode SET expiresAt = ? WHERE userId = ?')
                .run(new Date(0).toISOString(), user.id);
            await request(externalAuthApp)
                .post('/api/auth/claim')
                .send({ registrationToken: authResponse.body.registrationToken, linkCode: codeResponse.body.code })
                .expect(401);

            const freshCode = await request(externalAuthApp)
                .post('/api/auth/link-code')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);
            userRepository.updateUserStatus(user.id, false, 'INACTIVE', 0);
            const inactive = await request(externalAuthApp)
                .post('/api/auth/claim')
                .send({ registrationToken: authResponse.body.registrationToken, linkCode: freshCode.body.code })
                .expect(403);
            expect(inactive.body.errorCode).toBe('userIsNotActive');
        });

        it('keeps the link code and registration continuation after a provider conflict', async () => {
            const user = userService.registerUser(
                'Conflict Claim Owner',
                '@conflict_claim_owner',
                undefined,
                undefined,
                0
            );
            authProviderIdentityRepository.createIdentity(user.id, {
                provider: AuthProvider.GOOGLE,
                providerUserId: 'google-existing-conflict',
            });
            const externalAuthApp = createExternalAuthApp(
                new FakeExternalAuthTokenVerifier({
                    'conflict-claim-token': {
                        provider: AuthProvider.GOOGLE,
                        providerUserId: 'google-new-conflict',
                    },
                }, {})
            );
            const codeResponse = await request(externalAuthApp)
                .post('/api/auth/link-code')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);
            const authResponse = await request(externalAuthApp)
                .post('/api/auth/google')
                .send({ credential: 'conflict-claim-token' })
                .expect(200);

            const conflict = await request(externalAuthApp)
                .post('/api/auth/claim')
                .send({ registrationToken: authResponse.body.registrationToken, linkCode: codeResponse.body.code })
                .expect(409);

            expect(conflict.body.errorCode).toBe('userAlreadyHasAuthProvider');
            expect(dbManager.db.prepare('SELECT 1 FROM authLinkCode WHERE userId = ?').get(user.id)).toBeDefined();
            expect(
                dbManager.db.prepare(
                    'SELECT 1 FROM pendingExternalAuthRegistration WHERE tokenHash = ?'
                ).get(hashRegistrationToken(authResponse.body.registrationToken))
            ).toBeDefined();
        });

        it('claims Telegram Mini App identity and reconciles legacy Telegram fields', async () => {
            const telegramId = 654321789;
            const user = userService.registerUser(
                'Telegram Claim Owner',
                '@telegram_claim_owner',
                undefined,
                undefined,
                0
            );
            const codeResponse = await request(app)
                .post('/api/auth/link-code')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);
            const initData = generateValidInitData(telegramId, 'claimed_telegram');

            await request(app)
                .post('/api/auth/claim/telegram')
                .query(initData)
                .send({ linkCode: codeResponse.body.code })
                .expect(200);

            expect(authProviderIdentityRepository.findIdentity(AuthProvider.TELEGRAM, String(telegramId))?.userId)
                .toBe(user.id);
            expect(userRepository.findUserById(user.id)).toMatchObject({
                telegramId,
                telegramUsername: '@claimed_telegram',
            });
            await request(app).post('/api/authenticate').query(initData).expect(200);
        });
    });

    describe('provider unlinking', () => {
        it('refuses to unlink the last identity-based login method', async () => {
            const user = userService.registerUser('Last Google Owner', '@last_google_owner', undefined, undefined, 0);
            authProviderIdentityRepository.createIdentity(user.id, {
                provider: AuthProvider.GOOGLE,
                providerUserId: 'google-last-method',
            });

            const response = await request(app)
                .delete('/api/auth/providers/GOOGLE')
                .set('Authorization', createAuthHeader(user.id))
                .expect(400);

            expect(response.body.errorCode).toBe('cannotUnlinkLastAuthProvider');
            expect(authProviderIdentityRepository.findIdentity(AuthProvider.GOOGLE, 'google-last-method'))
                .toBeDefined();
        });

        it('unlinks one of two providers and returns the remaining provider', async () => {
            const user = userService.registerUser(
                'Multi Provider Owner',
                '@multi_provider_owner',
                undefined,
                undefined,
                0
            );
            authProviderIdentityRepository.createIdentity(user.id, {
                provider: AuthProvider.GOOGLE,
                providerUserId: 'google-multi-provider',
                displayName: 'Google Multi',
            });
            authProviderIdentityRepository.createIdentity(user.id, {
                provider: AuthProvider.DISCORD,
                providerUserId: 'discord-multi-provider',
                displayName: 'Discord Multi',
            });

            const response = await request(app)
                .delete('/api/auth/providers/DISCORD')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);

            expect(response.body).toEqual([expect.objectContaining({ provider: AuthProvider.GOOGLE })]);
            expect(authProviderIdentityRepository.findIdentity(AuthProvider.DISCORD, 'discord-multi-provider'))
                .toBeUndefined();
        });

        it('clears Telegram legacy fields so the next Mini App entrance requires registration or claim', async () => {
            const telegramId = 654321790;
            const user = userService.registerUser(
                'Unlink Telegram Owner',
                '@unlink_telegram_owner',
                '@unlink_telegram',
                telegramId,
                0
            );
            authProviderIdentityRepository.createIdentity(user.id, {
                provider: AuthProvider.GOOGLE,
                providerUserId: 'google-after-telegram-unlink',
            });
            authProviderIdentityRepository.createIdentity(user.id, {
                provider: AuthProvider.TELEGRAM,
                providerUserId: String(telegramId),
                username: '@unlink_telegram',
                telegramId,
            });

            const unlinkResponse = await request(app)
                .delete('/api/auth/providers/TELEGRAM')
                .set('Authorization', createAuthHeader(user.id))
                .expect(200);
            const storedUser = userRepository.findUserById(user.id)!;
            const loginResponse = await request(app)
                .post('/api/authenticate')
                .query(generateValidInitData(telegramId, 'unlink_telegram'))
                .expect(200);

            expect(unlinkResponse.body).toEqual([expect.objectContaining({ provider: AuthProvider.GOOGLE })]);
            expect(storedUser.telegramId).toBeNull();
            expect(storedUser.telegramUsername).toBeNull();
            expect(authProviderIdentityRepository.findIdentity(AuthProvider.TELEGRAM, String(telegramId)))
                .toBeUndefined();
            expect(loginResponse.body).toMatchObject({
                registrationRequired: true,
                provider: AuthProvider.TELEGRAM,
            });
        });

        it('counts a legacy Mini App login without an identity row as the last method', async () => {
            const telegramId = 654321791;
            const user = userService.registerUser(
                'Mini App Only Owner',
                '@mini_app_only_owner',
                '@mini_app_only',
                telegramId,
                0
            );

            const response = await request(app)
                .delete('/api/auth/providers/TELEGRAM')
                .set('Authorization', createAuthHeader(user.id))
                .expect(400);

            expect(response.body.errorCode).toBe('cannotUnlinkLastAuthProvider');
            expect(userRepository.findUserById(user.id)?.telegramId).toBe(telegramId);
        });

        it('rejects providers that are absent or malformed', async () => {
            const user = userService.registerUser(
                'Missing Provider Owner',
                '@missing_provider_owner',
                undefined,
                undefined,
                0
            );
            authProviderIdentityRepository.createIdentity(user.id, {
                provider: AuthProvider.GOOGLE,
                providerUserId: 'google-missing-provider-owner',
            });

            const absent = await request(app)
                .delete('/api/auth/providers/DISCORD')
                .set('Authorization', createAuthHeader(user.id))
                .expect(404);
            await request(app)
                .delete('/api/auth/providers/LINE')
                .set('Authorization', createAuthHeader(user.id))
                .expect(400);

            expect(absent.body.errorCode).toBe('authProviderNotLinked');
        });
    });
});
