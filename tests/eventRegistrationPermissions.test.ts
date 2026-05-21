import request from 'supertest';
import type { Response } from 'supertest';
import express from 'express';
import eventRoutes from '../src/routes/EventRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';
import { ProfileRepository } from '../src/repository/ProfileRepository.ts';

const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);
app.use('/api/users', userRoutes);
app.use(handleErrors);

type MatrixRole = 'admin' | 'owner' | 'moderator' | 'member' | 'nonMember' | 'pending' | 'otherClubOwner';

const SYSTEM_USER_ID = 0;

describe('Event registration permissions matrix', () => {
    const ADMIN_USER_ID = 97001;
    const OWNER_USER_ID = 97002;
    const MODERATOR_USER_ID = 97003;
    const MEMBER_USER_ID = 97004;
    const NON_MEMBER_USER_ID = 97005;
    const PENDING_USER_ID = 97006;
    const OTHER_CLUB_OWNER_USER_ID = 97007;

    const TEST_CLUB_ID = 97100;
    const OTHER_CLUB_ID = 97101;
    const GAME_RULES_ID = 97110;
    const TOURNAMENT_EVENT_ID = 97200;

    const profileRepo = new ProfileRepository();

    const authHeaders: Record<MatrixRole, string> = {
        admin: '',
        owner: '',
        moderator: '',
        member: '',
        nonMember: '',
        pending: '',
        otherClubOwner: ''
    };

    let timestampOffset = 0;
    function nextTs(): string {
        timestampOffset += 1;
        return new Date(Date.parse('2026-04-15T00:00:00.000Z') + timestampOffset).toISOString();
    }

    function insertUser(userId: number, name: string, isAdmin: boolean): void {
        const ts = nextTs();
        dbManager.db.prepare(
            `INSERT INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, NULL, NULL, ?, 1, 'ACTIVE', ?, ?, ?)`
        ).run(userId, name, isAdmin ? 1 : 0, ts, ts, SYSTEM_USER_ID);
    }

    function insertClub(clubId: number, name: string): void {
        const ts = nextTs();
        dbManager.db.prepare(
            `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, NULL, NULL, NULL, NULL, 1, ?, ?, ?)`
        ).run(clubId, name, ts, ts, SYSTEM_USER_ID);
    }

    function upsertMembership(clubId: number, userId: number, role: 'OWNER' | 'MODERATOR' | 'MEMBER', status: 'ACTIVE' | 'PENDING' | 'INACTIVE'): void {
        const ts = nextTs();
        dbManager.db.prepare(
            `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(clubId, userId) DO UPDATE SET role = excluded.role, status = excluded.status, modifiedAt = excluded.modifiedAt, modifiedBy = excluded.modifiedBy`
        ).run(clubId, userId, role, status, ts, ts, SYSTEM_USER_ID);
    }

    function setProfile(userId: number, firstName: string | null, lastName: string | null): void {
        profileRepo.upsertProfile(userId, null, null, firstName, lastName, null, false, SYSTEM_USER_ID);
    }

    function clearRegistrations(): void {
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId = ?').run(TOURNAMENT_EVENT_ID);
    }

    function seedRegistration(userId: number, status: 'PENDING' | 'APPROVED' | 'REJECTED'): void {
        const ts = nextTs();
        dbManager.db.prepare(
            `INSERT INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(eventId, userId) DO UPDATE SET status = excluded.status, modifiedAt = excluded.modifiedAt, modifiedBy = excluded.modifiedBy`
        ).run(TOURNAMENT_EVENT_ID, userId, status, ts, ts, SYSTEM_USER_ID);
    }

    function createRoleTest(
        role: MatrixRole,
        expectedStatus: number,
        sendRequest: (authHeader: string) => PromiseLike<Response>
    ): void {
        test(`${role} -> ${expectedStatus}`, async () => {
            const response = await sendRequest(authHeaders[role]);
            expect(response.status).toBe(expectedStatus);
        });
    }

    beforeAll(() => {
        insertUser(ADMIN_USER_ID, 'EReg Admin', true);
        insertUser(OWNER_USER_ID, 'EReg Owner', false);
        insertUser(MODERATOR_USER_ID, 'EReg Moderator', false);
        insertUser(MEMBER_USER_ID, 'EReg Member', false);
        insertUser(NON_MEMBER_USER_ID, 'EReg NonMember', false);
        insertUser(PENDING_USER_ID, 'EReg Pending', false);
        insertUser(OTHER_CLUB_OWNER_USER_ID, 'EReg OtherClubOwner', false);

        // Set firstName/lastName for all users so apply doesn't fail on missing profile names
        for (const id of [ADMIN_USER_ID, OWNER_USER_ID, MODERATOR_USER_ID, MEMBER_USER_ID, NON_MEMBER_USER_ID, PENDING_USER_ID, OTHER_CLUB_OWNER_USER_ID]) {
            setProfile(id, 'Імʼя', 'Прізвище');
        }

        insertClub(TEST_CLUB_ID, 'EReg Test Club');
        insertClub(OTHER_CLUB_ID, 'EReg Other Club');

        upsertMembership(TEST_CLUB_ID, OWNER_USER_ID, 'OWNER', 'ACTIVE');
        upsertMembership(TEST_CLUB_ID, MODERATOR_USER_ID, 'MODERATOR', 'ACTIVE');
        upsertMembership(TEST_CLUB_ID, MEMBER_USER_ID, 'MEMBER', 'ACTIVE');
        upsertMembership(TEST_CLUB_ID, PENDING_USER_ID, 'MEMBER', 'PENDING');
        upsertMembership(OTHER_CLUB_ID, OTHER_CLUB_OWNER_USER_ID, 'OWNER', 'ACTIVE');

        dbManager.db.prepare(
            `INSERT INTO gameRules (id, name, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, clubId)
             VALUES (?, 'EReg Rules', 4, '[15,5,-5,-15]', 30000, NULL, ?)`
        ).run(GAME_RULES_ID, TEST_CLUB_ID);

        dbManager.db.prepare(
            `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, maxParticipants, registrationDeadline, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'EReg Tournament', NULL, 'TOURNAMENT', ?, ?, NULL, NULL, NULL, NULL, 0, 0, ?, ?, ?)`
        ).run(TOURNAMENT_EVENT_ID, GAME_RULES_ID, TEST_CLUB_ID, nextTs(), nextTs(), SYSTEM_USER_ID);

        authHeaders.admin = createAuthHeader(ADMIN_USER_ID);
        authHeaders.owner = createAuthHeader(OWNER_USER_ID);
        authHeaders.moderator = createAuthHeader(MODERATOR_USER_ID);
        authHeaders.member = createAuthHeader(MEMBER_USER_ID);
        authHeaders.nonMember = createAuthHeader(NON_MEMBER_USER_ID);
        authHeaders.pending = createAuthHeader(PENDING_USER_ID);
        authHeaders.otherClubOwner = createAuthHeader(OTHER_CLUB_OWNER_USER_ID);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId = ?').run(TOURNAMENT_EVENT_ID);
        dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(TOURNAMENT_EVENT_ID);
        dbManager.db.prepare('DELETE FROM gameRules WHERE id = ?').run(GAME_RULES_ID);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId IN (?, ?)').run(TEST_CLUB_ID, OTHER_CLUB_ID);
        dbManager.db.prepare('DELETE FROM club WHERE id IN (?, ?)').run(TEST_CLUB_ID, OTHER_CLUB_ID);
        dbManager.db.prepare('DELETE FROM profile WHERE userId IN (?, ?, ?, ?, ?, ?, ?)').run(
            ADMIN_USER_ID, OWNER_USER_ID, MODERATOR_USER_ID, MEMBER_USER_ID, NON_MEMBER_USER_ID, PENDING_USER_ID, OTHER_CLUB_OWNER_USER_ID
        );
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?, ?, ?, ?, ?)').run(
            ADMIN_USER_ID, OWNER_USER_ID, MODERATOR_USER_ID, MEMBER_USER_ID, NON_MEMBER_USER_ID, PENDING_USER_ID, OTHER_CLUB_OWNER_USER_ID
        );
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('apply (self-action) — everyone authenticated can apply on a closed tournament', () => {
        afterEach(() => clearRegistrations());

        for (const role of ['admin', 'owner', 'moderator', 'member', 'nonMember', 'pending'] as const) {
            createRoleTest(
                role,
                201,
                (authHeader) => request(app).post(`/api/events/${TOURNAMENT_EVENT_ID}/register`).set('Authorization', authHeader).send({})
            );
        }
    });

    describe('list registrations — admin/owner/moderator only', () => {
        const cases: Array<[MatrixRole, number]> = [
            ['admin', 200], ['owner', 200], ['moderator', 200],
            ['member', 403], ['nonMember', 403], ['pending', 403], ['otherClubOwner', 403]
        ];
        for (const [role, expected] of cases) {
            createRoleTest(
                role,
                expected,
                (authHeader) => request(app).get(`/api/events/${TOURNAMENT_EVENT_ID}/registrations`).set('Authorization', authHeader)
            );
        }
    });

    describe('list registrations ?status=APPROVED — open to any authenticated user', () => {
        const cases: Array<[MatrixRole, number]> = [
            ['admin', 200], ['owner', 200], ['moderator', 200],
            ['member', 200], ['nonMember', 200], ['pending', 200], ['otherClubOwner', 200]
        ];
        for (const [role, expected] of cases) {
            createRoleTest(
                role,
                expected,
                (authHeader) => request(app)
                    .get(`/api/events/${TOURNAMENT_EVENT_ID}/registrations`)
                    .query({ status: 'APPROVED' })
                    .set('Authorization', authHeader)
            );
        }
    });

    describe('list registrations ?status=PENDING — still admin/owner/moderator only', () => {
        const cases: Array<[MatrixRole, number]> = [
            ['admin', 200], ['owner', 200], ['moderator', 200],
            ['member', 403], ['nonMember', 403], ['pending', 403], ['otherClubOwner', 403]
        ];
        for (const [role, expected] of cases) {
            createRoleTest(
                role,
                expected,
                (authHeader) => request(app)
                    .get(`/api/events/${TOURNAMENT_EVENT_ID}/registrations`)
                    .query({ status: 'PENDING' })
                    .set('Authorization', authHeader)
            );
        }
    });

    describe('approve registration — admin/owner/moderator only', () => {
        beforeEach(() => seedRegistration(NON_MEMBER_USER_ID, 'PENDING'));
        afterEach(() => clearRegistrations());

        const cases: Array<[MatrixRole, number]> = [
            ['admin', 200], ['owner', 200], ['moderator', 200],
            ['member', 403], ['nonMember', 403], ['pending', 403], ['otherClubOwner', 403]
        ];
        for (const [role, expected] of cases) {
            createRoleTest(
                role,
                expected,
                (authHeader) => request(app).post(`/api/events/${TOURNAMENT_EVENT_ID}/registrations/${NON_MEMBER_USER_ID}/approve`).set('Authorization', authHeader).send({})
            );
        }
    });

    describe('reject registration — admin/owner/moderator only', () => {
        beforeEach(() => seedRegistration(NON_MEMBER_USER_ID, 'PENDING'));
        afterEach(() => clearRegistrations());

        const cases: Array<[MatrixRole, number]> = [
            ['admin', 200], ['owner', 200], ['moderator', 200],
            ['member', 403], ['nonMember', 403], ['pending', 403], ['otherClubOwner', 403]
        ];
        for (const [role, expected] of cases) {
            createRoleTest(
                role,
                expected,
                (authHeader) => request(app).post(`/api/events/${TOURNAMENT_EVENT_ID}/registrations/${NON_MEMBER_USER_ID}/reject`).set('Authorization', authHeader).send({})
            );
        }
    });

    describe('manual register — admin/owner/moderator only', () => {
        afterEach(() => clearRegistrations());

        const cases: Array<[MatrixRole, number]> = [
            ['admin', 200], ['owner', 200], ['moderator', 200],
            ['member', 403], ['nonMember', 403], ['pending', 403], ['otherClubOwner', 403]
        ];
        for (const [role, expected] of cases) {
            createRoleTest(
                role,
                expected,
                (authHeader) => request(app).post(`/api/events/${TOURNAMENT_EVENT_ID}/registrations/${NON_MEMBER_USER_ID}/manual`).set('Authorization', authHeader).send({})
            );
        }
    });

    describe('edit participant profile names — admin/owner/moderator only', () => {
        beforeEach(() => seedRegistration(NON_MEMBER_USER_ID, 'PENDING'));
        afterEach(() => clearRegistrations());

        const cases: Array<[MatrixRole, number]> = [
            ['admin', 200], ['owner', 200], ['moderator', 200],
            ['member', 403], ['nonMember', 403], ['pending', 403], ['otherClubOwner', 403]
        ];
        for (const [role, expected] of cases) {
            createRoleTest(
                role,
                expected,
                (authHeader) => request(app)
                    .patch(`/api/events/${TOURNAMENT_EVENT_ID}/registrations/${NON_MEMBER_USER_ID}/profile`)
                    .set('Authorization', authHeader)
                    .send({ firstName: 'NewName' })
            );
        }
    });

    describe('set filler player — admin/owner/moderator only', () => {
        beforeEach(() => seedRegistration(NON_MEMBER_USER_ID, 'APPROVED'));
        afterEach(() => clearRegistrations());

        const cases: Array<[MatrixRole, number]> = [
            ['admin', 200], ['owner', 200], ['moderator', 200],
            ['member', 403], ['nonMember', 403], ['pending', 403], ['otherClubOwner', 403]
        ];
        for (const [role, expected] of cases) {
            createRoleTest(
                role,
                expected,
                (authHeader) => request(app)
                    .patch(`/api/events/${TOURNAMENT_EVENT_ID}/registrations/${NON_MEMBER_USER_ID}/filler-player`)
                    .set('Authorization', authHeader)
                    .send({ isFillerPlayer: true })
            );
        }

        it('persists isFillerPlayer when owner sets it', async () => {
            const response = await request(app)
                .patch(`/api/events/${TOURNAMENT_EVENT_ID}/registrations/${NON_MEMBER_USER_ID}/filler-player`)
                .set('Authorization', authHeaders.owner)
                .send({ isFillerPlayer: true });
            expect(response.status).toBe(200);
            expect(response.body.isFillerPlayer).toBe(true);
        });
    });

    describe('withdraw — only the applicant', () => {
        beforeEach(() => {
            seedRegistration(MEMBER_USER_ID, 'PENDING');
        });
        afterEach(() => clearRegistrations());

        // The MEMBER applicant can withdraw their own registration.
        createRoleTest(
            'member',
            204,
            (authHeader) => request(app).post(`/api/events/${TOURNAMENT_EVENT_ID}/withdraw`).set('Authorization', authHeader).send({})
        );

        // Other roles trying to withdraw their own (non-existent) registration get a 404, not a 403:
        // withdraw is open to any authenticated user but operates only on their own registration.
        for (const role of ['admin', 'owner', 'moderator', 'nonMember', 'pending'] as const) {
            createRoleTest(
                role,
                404,
                (authHeader) => request(app).post(`/api/events/${TOURNAMENT_EVENT_ID}/withdraw`).set('Authorization', authHeader).send({})
            );
        }
    });

    describe('me/registrations — any authenticated user can read their own', () => {
        for (const role of ['admin', 'owner', 'moderator', 'member', 'nonMember', 'pending'] as const) {
            createRoleTest(
                role,
                200,
                (authHeader) => request(app).get('/api/users/current/registrations').set('Authorization', authHeader)
            );
        }
    });

    describe('Edge cases', () => {
        afterEach(() => clearRegistrations());

        it('apply without firstName/lastName → 400 MissingProfileNamesForTournamentRegistrationError', async () => {
            // Strip names from MEMBER user
            profileRepo.upsertProfile(MEMBER_USER_ID, null, null, null, null, null, false, SYSTEM_USER_ID);
            try {
                const response = await request(app)
                    .post(`/api/events/${TOURNAMENT_EVENT_ID}/register`)
                    .set('Authorization', authHeaders.member)
                    .send({});
                expect(response.status).toBe(400);
                expect(response.body.errorCode).toBe('missingProfileNamesForTournamentRegistration');
            } finally {
                setProfile(MEMBER_USER_ID, 'Імʼя', 'Прізвище');
            }
        });

        it('apply when already APPROVED is idempotent (no duplicate row)', async () => {
            seedRegistration(MEMBER_USER_ID, 'APPROVED');
            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/register`)
                .set('Authorization', authHeaders.member)
                .send({});
            expect(response.status).toBe(201);
            expect(response.body.status).toBe('APPROVED');

            const count = (dbManager.db.prepare('SELECT COUNT(*) as count FROM eventRegistration WHERE eventId = ? AND userId = ?').get(TOURNAMENT_EVENT_ID, MEMBER_USER_ID) as { count: number }).count;
            expect(count).toBe(1);
        });

        it('apply after REJECTED flips status back to PENDING', async () => {
            seedRegistration(MEMBER_USER_ID, 'REJECTED');
            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/register`)
                .set('Authorization', authHeaders.member)
                .send({});
            expect(response.status).toBe(201);
            expect(response.body.status).toBe('PENDING');
        });

        it('approve atomically activates clubMembership for non-member', async () => {
            // First clear any existing membership for NON_MEMBER
            dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ? AND userId = ?').run(TEST_CLUB_ID, NON_MEMBER_USER_ID);

            await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/register`)
                .set('Authorization', authHeaders.nonMember)
                .send({})
                .expect(201);

            const membershipBefore = dbManager.db.prepare('SELECT status FROM clubMembership WHERE clubId = ? AND userId = ?').get(TEST_CLUB_ID, NON_MEMBER_USER_ID) as { status: string };
            expect(membershipBefore.status).toBe('PENDING');

            await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/registrations/${NON_MEMBER_USER_ID}/approve`)
                .set('Authorization', authHeaders.owner)
                .send({})
                .expect(200);

            const regAfter = dbManager.db.prepare('SELECT status FROM eventRegistration WHERE eventId = ? AND userId = ?').get(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID) as { status: string };
            const membershipAfter = dbManager.db.prepare('SELECT status FROM clubMembership WHERE clubId = ? AND userId = ?').get(TEST_CLUB_ID, NON_MEMBER_USER_ID) as { status: string };
            expect(regAfter.status).toBe('APPROVED');
            expect(membershipAfter.status).toBe('ACTIVE');

            // cleanup
            dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ? AND userId = ?').run(TEST_CLUB_ID, NON_MEMBER_USER_ID);
        });

        it('manual on non-member → registration APPROVED + membership ACTIVE in one call', async () => {
            dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ? AND userId = ?').run(TEST_CLUB_ID, NON_MEMBER_USER_ID);

            await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/registrations/${NON_MEMBER_USER_ID}/manual`)
                .set('Authorization', authHeaders.owner)
                .send({})
                .expect(200);

            const reg = dbManager.db.prepare('SELECT status FROM eventRegistration WHERE eventId = ? AND userId = ?').get(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID) as { status: string };
            const membership = dbManager.db.prepare('SELECT status FROM clubMembership WHERE clubId = ? AND userId = ?').get(TEST_CLUB_ID, NON_MEMBER_USER_ID) as { status: string };
            expect(reg.status).toBe('APPROVED');
            expect(membership.status).toBe('ACTIVE');

            dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ? AND userId = ?').run(TEST_CLUB_ID, NON_MEMBER_USER_ID);
        });

        it('withdraw allows re-apply afterwards', async () => {
            seedRegistration(MEMBER_USER_ID, 'PENDING');
            await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/withdraw`)
                .set('Authorization', authHeaders.member)
                .send({})
                .expect(204);

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/register`)
                .set('Authorization', authHeaders.member)
                .send({});
            expect(response.status).toBe(201);
            expect(response.body.status).toBe('PENDING');
        });

        it('creating a TOURNAMENT without clubId → 400', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', authHeaders.admin)
                .send({
                    name: 'Bad Tournament',
                    type: 'TOURNAMENT',
                    gameRulesId: GAME_RULES_ID,
                    clubId: null,
                    startingRating: 0,
                    minimumGamesForRating: 0
                });
            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('tournamentMustHaveClub');
        });

        it('DELETE event with existing registrations → 400 CannotDeleteEventWithRegistrationsError', async () => {
            // Insert a separate event we can attempt to delete
            const tempEventId = 97250;
            const ts = nextTs();
            dbManager.db.prepare(
                `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, maxParticipants, registrationDeadline, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, 'EReg Deletable', NULL, 'TOURNAMENT', ?, ?, NULL, NULL, NULL, NULL, 0, 0, ?, ?, ?)`
            ).run(tempEventId, GAME_RULES_ID, TEST_CLUB_ID, ts, ts, SYSTEM_USER_ID);

            dbManager.db.prepare(
                `INSERT INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'APPROVED', ?, ?, ?)`
            ).run(tempEventId, MEMBER_USER_ID, ts, ts, SYSTEM_USER_ID);

            try {
                const response = await request(app)
                    .delete(`/api/events/${tempEventId}`)
                    .set('Authorization', authHeaders.admin);
                expect(response.status).toBe(400);
                expect(response.body.errorCode).toBe('cannotDeleteEventWithRegistrations');
            } finally {
                dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId = ?').run(tempEventId);
                dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(tempEventId);
            }
        });
    });
});
