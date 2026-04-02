import request from 'supertest';
import type { Response } from 'supertest';
import express from 'express';
import clubRoutes from '../src/routes/ClubRoutes.ts';
import eventRoutes from '../src/routes/EventRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import gameRulesRoutes from '../src/routes/GameRulesRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api/clubs', clubRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/users', userRoutes);
app.use('/api/game-rules', gameRulesRoutes);
app.use(handleErrors);

type MatrixRole = 'admin' | 'owner' | 'moderator' | 'member' | 'nonMember';
type AuthRole = MatrixRole | 'pending';
type MembershipRole = 'OWNER' | 'MODERATOR' | 'MEMBER';
type MembershipStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';
type UserStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';

describe('Permissions matrix integration specification', () => {
    const SYSTEM_USER_ID = 0;

    const ADMIN_USER_ID = 95001;
    const OWNER_USER_ID = 95002;
    const MODERATOR_USER_ID = 95003;
    const MEMBER_USER_ID = 95004;
    const NON_MEMBER_USER_ID = 95005;
    const PENDING_ACTIVATION_USER_ID = 95006;

    const TEST_CLUB_ID = 95100;
    const OWN_CLUB_GAME_RULES_ID = 95110;
    const GLOBAL_GAME_RULES_ID = 95111;

    let sequence = 95200;
    let timestampOffsetMs = 0;

    const baseTimestampMs = Date.parse('2026-03-16T00:00:00.000Z');

    const authHeaders: Record<AuthRole, string> = {
        admin: '',
        owner: '',
        moderator: '',
        member: '',
        nonMember: '',
        pending: ''
    };

    const roleLabels: Record<MatrixRole, string> = {
        admin: 'System Admin',
        owner: 'Club OWNER',
        moderator: 'MODERATOR',
        member: 'MEMBER',
        nonMember: 'Non-member'
    };

    function nextId(): number {
        sequence += 1;
        return sequence;
    }

    function nextTimestamp(): string {
        timestampOffsetMs += 1;
        return new Date(baseTimestampMs + timestampOffsetMs).toISOString();
    }

    function insertUser(params: {
        userId: number;
        name: string;
        telegramUsername: string | null;
        telegramId: number | null;
        isAdmin: boolean;
        isActive: boolean;
        status: UserStatus;
    }): void {
        const timestamp = nextTimestamp();
        dbManager.db.prepare(
            `INSERT INTO user (id, telegramUsername, telegramId, name, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            params.userId,
            params.telegramUsername,
            params.telegramId,
            params.name,
            timestamp,
            timestamp,
            SYSTEM_USER_ID,
            params.isActive ? 1 : 0,
            params.isAdmin ? 1 : 0,
            params.status
        );
    }

    function setUserStatus(userId: number, isActive: boolean, status: UserStatus): void {
        dbManager.db.prepare(
            `UPDATE user
             SET isActive = ?, status = ?, modifiedAt = ?, modifiedBy = ?
             WHERE id = ?`
        ).run(isActive ? 1 : 0, status, nextTimestamp(), SYSTEM_USER_ID, userId);
    }

    function insertClub(clubId: number, name: string): void {
        const timestamp = nextTimestamp();
        dbManager.db.prepare(
            `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(clubId, name, null, null, null, null, 1, timestamp, timestamp, SYSTEM_USER_ID);
    }

    function cleanupClub(clubId: number): void {
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
    }

    function upsertMembership(
        clubId: number,
        userId: number,
        role: MembershipRole,
        status: MembershipStatus
    ): void {
        const timestamp = nextTimestamp();
        dbManager.db.prepare(
            `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(clubId, userId) DO UPDATE SET
                role = excluded.role,
                status = excluded.status,
                modifiedAt = excluded.modifiedAt,
                modifiedBy = excluded.modifiedBy`
        ).run(clubId, userId, role, status, timestamp, timestamp, SYSTEM_USER_ID);
    }

    function insertGameRules(
        gameRulesId: number,
        name: string,
        numberOfPlayers: number,
        startingPoints: number,
        clubId: number | null
    ): void {
        dbManager.db.prepare(
            `INSERT INTO gameRules (id, name, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, clubId)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(gameRulesId, name, numberOfPlayers, '15,0,-15', startingPoints, null, clubId);
    }

    function insertEvent(eventId: number, name: string, clubId: number | null, gameRulesId: number): void {
        const timestamp = nextTimestamp();
        dbManager.db.prepare(
            `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, minimumGamesForRating, startingRating, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            eventId,
            name,
            'Permissions Matrix Event',
            'SEASON',
            gameRulesId,
            clubId,
            null,
            null,
            0,
            1000,
            timestamp,
            timestamp,
            SYSTEM_USER_ID
        );
    }

    function insertGame(gameId: number, eventId: number): void {
        const timestamp = nextTimestamp();
        dbManager.db.prepare(
            `INSERT INTO game (id, eventId, createdAt, modifiedAt, modifiedBy, tournamentHanchanNumber, tournamentTableNumber)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(gameId, eventId, timestamp, timestamp, SYSTEM_USER_ID, null, null);
    }

    function cleanupEventCascade(eventId: number): void {
        dbManager.db.prepare('DELETE FROM userRatingChange WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(eventId);
        dbManager.db.prepare('DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(eventId);
        dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(eventId);
        dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(eventId);
    }

    function buildClubCreatePayload(): { name: string } {
        return {
            name: `Permissions Matrix Club ${nextId()}`
        };
    }

    function buildClubUpdatePayload(): {
        name: string;
        address: string | null;
        city: string | null;
        description: string | null;
        contactInfo: string | null;
        isActive: boolean;
    } {
        return {
            name: `Permissions Matrix Club Updated ${nextId()}`,
            address: null,
            city: null,
            description: null,
            contactInfo: null,
            isActive: true,
        };
    }

    function buildEventPayload(clubId: number | null, gameRulesId: number): {
        name: string;
        description: string;
        type: 'SEASON';
        gameRulesId: number;
        clubId: number | null;
        dateFrom: string;
        dateTo: string;
    } {
        return {
            name: `Permissions Matrix Event ${nextId()}`,
            description: 'Permissions matrix event payload',
            type: 'SEASON',
            gameRulesId,
            clubId,
            dateFrom: '2024-01-01T00:00:00.000Z',
            dateTo: '2030-01-01T00:00:00.000Z'
        };
    }

    function buildGameRulesCreatePayload(clubId: number): {
        name: string;
        numberOfPlayers: number;
        uma: number[];
        startingPoints: number;
        startingRating: number;
        minimumGamesForRating: number;
        clubId: number;
    } {
        return {
            name: `Permissions Matrix Rules ${nextId()}`,
            numberOfPlayers: 4,
            uma: [15, 5, -5, -15],
            startingPoints: 30000,
            startingRating: 1000,
            minimumGamesForRating: 0,
            clubId
        };
    }

    function buildGamePayload(eventId: number, includeNonClubPlayer: boolean): {
        eventId: number;
        playersData: Array<{
            userId: number;
            points: number;
            startPlace: 'EAST' | 'SOUTH' | 'WEST';
        }>;
    } {
        return {
            eventId,
            playersData: [
                {
                    userId: OWNER_USER_ID,
                    points: 50000,
                    startPlace: 'EAST'
                },
                {
                    userId: MODERATOR_USER_ID,
                    points: 40000,
                    startPlace: 'SOUTH'
                },
                {
                    userId: includeNonClubPlayer ? NON_MEMBER_USER_ID : MEMBER_USER_ID,
                    points: 30000,
                    startPlace: 'WEST'
                }
            ]
        };
    }

    function captureCreatedId(response: Response, ids: Set<number>): void {
        const createdId = response.body?.id;
        if (typeof createdId === 'number') {
            ids.add(createdId);
        }
    }

    function createRoleTest(
        role: MatrixRole,
        expectedStatus: number,
        sendRequest: (authHeader: string) => PromiseLike<Response>,
        onResponse?: (response: Response) => void
    ): void {
        test(`${roleLabels[role]} -> ${expectedStatus}`, async () => {
            const response = await sendRequest(authHeaders[role]);
            if (onResponse !== undefined) {
                onResponse(response);
            }
            expect(response.status).toBe(expectedStatus);
        });
    }

    beforeAll(() => {
        insertUser({
            userId: ADMIN_USER_ID,
            name: 'Permissions Matrix ADMIN_USER',
            telegramUsername: 'pm_admin_user',
            telegramId: 950010001,
            isAdmin: true,
            isActive: true,
            status: 'ACTIVE'
        });

        insertUser({
            userId: OWNER_USER_ID,
            name: 'Permissions Matrix OWNER_USER',
            telegramUsername: 'pm_owner_user',
            telegramId: 950020001,
            isAdmin: false,
            isActive: true,
            status: 'ACTIVE'
        });

        insertUser({
            userId: MODERATOR_USER_ID,
            name: 'Permissions Matrix MODERATOR_USER',
            telegramUsername: 'pm_moderator_user',
            telegramId: 950030001,
            isAdmin: false,
            isActive: true,
            status: 'ACTIVE'
        });

        insertUser({
            userId: MEMBER_USER_ID,
            name: 'Permissions Matrix MEMBER_USER',
            telegramUsername: 'pm_member_user',
            telegramId: 950040001,
            isAdmin: false,
            isActive: true,
            status: 'ACTIVE'
        });

        insertUser({
            userId: NON_MEMBER_USER_ID,
            name: 'Permissions Matrix NON_MEMBER_USER',
            telegramUsername: 'pm_non_member_user',
            telegramId: 950050001,
            isAdmin: false,
            isActive: true,
            status: 'ACTIVE'
        });

        insertUser({
            userId: PENDING_ACTIVATION_USER_ID,
            name: 'Permissions Matrix PENDING_ACTIVATION_USER',
            telegramUsername: 'pm_pending_activation_user',
            telegramId: null,
            isAdmin: false,
            isActive: false,
            status: 'PENDING'
        });

        insertClub(TEST_CLUB_ID, 'Permissions Matrix Test Club');

        upsertMembership(TEST_CLUB_ID, OWNER_USER_ID, 'OWNER', 'ACTIVE');
        upsertMembership(TEST_CLUB_ID, MODERATOR_USER_ID, 'MODERATOR', 'ACTIVE');
        upsertMembership(TEST_CLUB_ID, MEMBER_USER_ID, 'MEMBER', 'ACTIVE');
        upsertMembership(TEST_CLUB_ID, PENDING_ACTIVATION_USER_ID, 'MEMBER', 'ACTIVE');

        insertGameRules(OWN_CLUB_GAME_RULES_ID, 'Permissions Matrix Own Club Rules', 3, 40000, TEST_CLUB_ID);
        insertGameRules(GLOBAL_GAME_RULES_ID, 'Permissions Matrix Global Rules', 3, 40000, null);

        authHeaders.admin = createAuthHeader(ADMIN_USER_ID);
        authHeaders.owner = createAuthHeader(OWNER_USER_ID);
        authHeaders.moderator = createAuthHeader(MODERATOR_USER_ID);
        authHeaders.member = createAuthHeader(MEMBER_USER_ID);
        authHeaders.nonMember = createAuthHeader(NON_MEMBER_USER_ID);
        authHeaders.pending = createAuthHeader(PENDING_ACTIVATION_USER_ID);
    });

    afterAll(() => {
        dbManager.db.prepare(
            `DELETE FROM userRatingChange
             WHERE gameId IN (
                SELECT g.id
                FROM game g
                JOIN event e ON e.id = g.eventId
                WHERE e.name LIKE 'Permissions Matrix %'
             )`
        ).run();

        dbManager.db.prepare(
            `DELETE FROM userToGame
             WHERE gameId IN (
                SELECT g.id
                FROM game g
                JOIN event e ON e.id = g.eventId
                WHERE e.name LIKE 'Permissions Matrix %'
             )`
        ).run();

        dbManager.db.prepare(
            `DELETE FROM game
             WHERE eventId IN (
                SELECT id FROM event WHERE name LIKE 'Permissions Matrix %'
             )`
        ).run();

        dbManager.db.prepare(`DELETE FROM event WHERE name LIKE 'Permissions Matrix %'`).run();
        dbManager.db.prepare(`DELETE FROM gameRules WHERE name LIKE 'Permissions Matrix %'`).run();

        dbManager.db.prepare(
            `DELETE FROM clubMembership
             WHERE clubId IN (
                SELECT id FROM club WHERE name LIKE 'Permissions Matrix %'
             )`
        ).run();
        dbManager.db.prepare(`DELETE FROM club WHERE name LIKE 'Permissions Matrix %'`).run();

        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?, ?, ?, ?)').run(
            ADMIN_USER_ID,
            OWNER_USER_ID,
            MODERATOR_USER_ID,
            MEMBER_USER_ID,
            NON_MEMBER_USER_ID,
            PENDING_ACTIVATION_USER_ID
        );

        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('Create club', () => {
        const createdClubIds = new Set<number>();

        afterEach(() => {
            for (const clubId of createdClubIds) {
                cleanupClub(clubId);
            }
            createdClubIds.clear();
        });

        createRoleTest(
            'admin',
            201,
            (authHeader) => request(app).post('/api/clubs').set('Authorization', authHeader).send(buildClubCreatePayload()),
            (response) => captureCreatedId(response, createdClubIds)
        );

        createRoleTest(
            'owner',
            403,
            (authHeader) => request(app).post('/api/clubs').set('Authorization', authHeader).send(buildClubCreatePayload()),
            (response) => captureCreatedId(response, createdClubIds)
        );

        createRoleTest(
            'moderator',
            403,
            (authHeader) => request(app).post('/api/clubs').set('Authorization', authHeader).send(buildClubCreatePayload()),
            (response) => captureCreatedId(response, createdClubIds)
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app).post('/api/clubs').set('Authorization', authHeader).send(buildClubCreatePayload()),
            (response) => captureCreatedId(response, createdClubIds)
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app).post('/api/clubs').set('Authorization', authHeader).send(buildClubCreatePayload()),
            (response) => captureCreatedId(response, createdClubIds)
        );
    });

    describe('Edit club (own)', () => {
        createRoleTest(
            'admin',
            200,
            (authHeader) => request(app)
                .put(`/api/clubs/${TEST_CLUB_ID}`)
                .set('Authorization', authHeader)
                .send(buildClubUpdatePayload())
        );

        createRoleTest(
            'owner',
            200,
            (authHeader) => request(app)
                .put(`/api/clubs/${TEST_CLUB_ID}`)
                .set('Authorization', authHeader)
                .send(buildClubUpdatePayload())
        );

        createRoleTest(
            'moderator',
            403,
            (authHeader) => request(app)
                .put(`/api/clubs/${TEST_CLUB_ID}`)
                .set('Authorization', authHeader)
                .send(buildClubUpdatePayload())
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .put(`/api/clubs/${TEST_CLUB_ID}`)
                .set('Authorization', authHeader)
                .send(buildClubUpdatePayload())
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .put(`/api/clubs/${TEST_CLUB_ID}`)
                .set('Authorization', authHeader)
                .send(buildClubUpdatePayload())
        );
    });

    describe('Delete/deactivate club', () => {
        let deletableClubId: number;

        beforeEach(() => {
            deletableClubId = nextId();
            insertClub(deletableClubId, `Permissions Matrix Deletable Club ${deletableClubId}`);
        });

        afterEach(() => {
            cleanupClub(deletableClubId);
        });

        createRoleTest(
            'admin',
            204,
            (authHeader) => request(app)
                .delete(`/api/clubs/${deletableClubId}`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'owner',
            403,
            (authHeader) => request(app)
                .delete(`/api/clubs/${deletableClubId}`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'moderator',
            403,
            (authHeader) => request(app)
                .delete(`/api/clubs/${deletableClubId}`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .delete(`/api/clubs/${deletableClubId}`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .delete(`/api/clubs/${deletableClubId}`)
                .set('Authorization', authHeader)
        );
    });

    describe('Activate user (in own club)', () => {
        beforeEach(() => {
            setUserStatus(PENDING_ACTIVATION_USER_ID, false, 'PENDING');
            upsertMembership(TEST_CLUB_ID, PENDING_ACTIVATION_USER_ID, 'MEMBER', 'ACTIVE');
        });

        createRoleTest(
            'admin',
            200,
            (authHeader) => request(app)
                .post(`/api/users/${PENDING_ACTIVATION_USER_ID}/activate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'owner',
            200,
            (authHeader) => request(app)
                .post(`/api/users/${PENDING_ACTIVATION_USER_ID}/activate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'moderator',
            200,
            (authHeader) => request(app)
                .post(`/api/users/${PENDING_ACTIVATION_USER_ID}/activate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .post(`/api/users/${PENDING_ACTIVATION_USER_ID}/activate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .post(`/api/users/${PENDING_ACTIVATION_USER_ID}/activate`)
                .set('Authorization', authHeader)
        );
    });

    describe('Deactivate user (in own club)', () => {
        beforeEach(() => {
            setUserStatus(MEMBER_USER_ID, true, 'ACTIVE');
            upsertMembership(TEST_CLUB_ID, MEMBER_USER_ID, 'MEMBER', 'ACTIVE');
        });

        createRoleTest(
            'admin',
            200,
            (authHeader) => request(app)
                .post(`/api/users/${MEMBER_USER_ID}/deactivate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'owner',
            200,
            (authHeader) => request(app)
                .post(`/api/users/${MEMBER_USER_ID}/deactivate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'moderator',
            403,
            (authHeader) => request(app)
                .post(`/api/users/${MEMBER_USER_ID}/deactivate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .post(`/api/users/${MEMBER_USER_ID}/deactivate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .post(`/api/users/${MEMBER_USER_ID}/deactivate`)
                .set('Authorization', authHeader)
        );
    });

    describe('Create event (for own club)', () => {
        const createdEventIds = new Set<number>();

        afterEach(() => {
            for (const eventId of createdEventIds) {
                cleanupEventCascade(eventId);
            }
            createdEventIds.clear();
        });

        createRoleTest(
            'admin',
            201,
            (authHeader) => request(app)
                .post('/api/events')
                .set('Authorization', authHeader)
                .send(buildEventPayload(TEST_CLUB_ID, OWN_CLUB_GAME_RULES_ID)),
            (response) => captureCreatedId(response, createdEventIds)
        );

        createRoleTest(
            'owner',
            201,
            (authHeader) => request(app)
                .post('/api/events')
                .set('Authorization', authHeader)
                .send(buildEventPayload(TEST_CLUB_ID, OWN_CLUB_GAME_RULES_ID)),
            (response) => captureCreatedId(response, createdEventIds)
        );

        createRoleTest(
            'moderator',
            403,
            (authHeader) => request(app)
                .post('/api/events')
                .set('Authorization', authHeader)
                .send(buildEventPayload(TEST_CLUB_ID, OWN_CLUB_GAME_RULES_ID)),
            (response) => captureCreatedId(response, createdEventIds)
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .post('/api/events')
                .set('Authorization', authHeader)
                .send(buildEventPayload(TEST_CLUB_ID, OWN_CLUB_GAME_RULES_ID)),
            (response) => captureCreatedId(response, createdEventIds)
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .post('/api/events')
                .set('Authorization', authHeader)
                .send(buildEventPayload(TEST_CLUB_ID, OWN_CLUB_GAME_RULES_ID)),
            (response) => captureCreatedId(response, createdEventIds)
        );
    });

    describe('Edit event (for own club)', () => {
        let editableEventId: number;

        beforeEach(() => {
            editableEventId = nextId();
            insertEvent(
                editableEventId,
                `Permissions Matrix Editable Event ${editableEventId}`,
                TEST_CLUB_ID,
                OWN_CLUB_GAME_RULES_ID
            );
        });

        afterEach(() => {
            cleanupEventCascade(editableEventId);
        });

        createRoleTest(
            'admin',
            200,
            (authHeader) => request(app)
                .put(`/api/events/${editableEventId}`)
                .set('Authorization', authHeader)
                .send(buildEventPayload(TEST_CLUB_ID, OWN_CLUB_GAME_RULES_ID))
        );

        createRoleTest(
            'owner',
            200,
            (authHeader) => request(app)
                .put(`/api/events/${editableEventId}`)
                .set('Authorization', authHeader)
                .send(buildEventPayload(TEST_CLUB_ID, OWN_CLUB_GAME_RULES_ID))
        );

        createRoleTest(
            'moderator',
            403,
            (authHeader) => request(app)
                .put(`/api/events/${editableEventId}`)
                .set('Authorization', authHeader)
                .send(buildEventPayload(TEST_CLUB_ID, OWN_CLUB_GAME_RULES_ID))
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .put(`/api/events/${editableEventId}`)
                .set('Authorization', authHeader)
                .send(buildEventPayload(TEST_CLUB_ID, OWN_CLUB_GAME_RULES_ID))
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .put(`/api/events/${editableEventId}`)
                .set('Authorization', authHeader)
                .send(buildEventPayload(TEST_CLUB_ID, OWN_CLUB_GAME_RULES_ID))
        );
    });

    describe('Create game rules (for own club)', () => {
        // TODO: endpoint not yet implemented
        test.skip('System Admin -> 201', async () => {
            const response = await request(app)
                .post('/api/game-rules')
                .set('Authorization', authHeaders.admin)
                .send(buildGameRulesCreatePayload(TEST_CLUB_ID));

            expect(response.status).toBe(201);
        });

        test.skip('Club OWNER -> 201', async () => {
            const response = await request(app)
                .post('/api/game-rules')
                .set('Authorization', authHeaders.owner)
                .send(buildGameRulesCreatePayload(TEST_CLUB_ID));

            expect(response.status).toBe(201);
        });

        test.skip('MODERATOR -> 403', async () => {
            const response = await request(app)
                .post('/api/game-rules')
                .set('Authorization', authHeaders.moderator)
                .send(buildGameRulesCreatePayload(TEST_CLUB_ID));

            expect(response.status).toBe(403);
        });

        test.skip('MEMBER -> 403', async () => {
            const response = await request(app)
                .post('/api/game-rules')
                .set('Authorization', authHeaders.member)
                .send(buildGameRulesCreatePayload(TEST_CLUB_ID));

            expect(response.status).toBe(403);
        });

        test.skip('Non-member -> 403', async () => {
            const response = await request(app)
                .post('/api/game-rules')
                .set('Authorization', authHeaders.nonMember)
                .send(buildGameRulesCreatePayload(TEST_CLUB_ID));

            expect(response.status).toBe(403);
        });
    });

    describe('Create game', () => {
        let gameEventId: number;

        beforeEach(() => {
            gameEventId = nextId();
            insertEvent(
                gameEventId,
                `Permissions Matrix Create Game Event ${gameEventId}`,
                TEST_CLUB_ID,
                OWN_CLUB_GAME_RULES_ID
            );
        });

        afterEach(() => {
            cleanupEventCascade(gameEventId);
        });

        createRoleTest(
            'admin',
            201,
            (authHeader) => request(app)
                .post('/api/games')
                .set('Authorization', authHeader)
                .send(buildGamePayload(gameEventId, false))
        );

        createRoleTest(
            'owner',
            201,
            (authHeader) => request(app)
                .post('/api/games')
                .set('Authorization', authHeader)
                .send(buildGamePayload(gameEventId, false))
        );

        createRoleTest(
            'moderator',
            201,
            (authHeader) => request(app)
                .post('/api/games')
                .set('Authorization', authHeader)
                .send(buildGamePayload(gameEventId, false))
        );

        createRoleTest(
            'member',
            201,
            (authHeader) => request(app)
                .post('/api/games')
                .set('Authorization', authHeader)
                .send(buildGamePayload(gameEventId, false))
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .post('/api/games')
                .set('Authorization', authHeader)
                .send(buildGamePayload(gameEventId, false))
        );

        test('MEMBER with non-club players -> 403', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', authHeaders.member)
                .send(buildGamePayload(gameEventId, true));

            expect(response.status).toBe(403);
        });
    });

    describe('Edit game (in own club)', () => {
        let editableEventId: number;
        let editableGameId: number;

        beforeEach(() => {
            editableEventId = nextId();
            insertEvent(
                editableEventId,
                `Permissions Matrix Edit Game Event ${editableEventId}`,
                TEST_CLUB_ID,
                OWN_CLUB_GAME_RULES_ID
            );

            editableGameId = nextId();
            insertGame(editableGameId, editableEventId);
        });

        afterEach(() => {
            cleanupEventCascade(editableEventId);
        });

        createRoleTest(
            'admin',
            200,
            (authHeader) => request(app)
                .put(`/api/games/${editableGameId}`)
                .set('Authorization', authHeader)
                .send(buildGamePayload(editableEventId, false))
        );

        createRoleTest(
            'owner',
            200,
            (authHeader) => request(app)
                .put(`/api/games/${editableGameId}`)
                .set('Authorization', authHeader)
                .send(buildGamePayload(editableEventId, false))
        );

        createRoleTest(
            'moderator',
            200,
            (authHeader) => request(app)
                .put(`/api/games/${editableGameId}`)
                .set('Authorization', authHeader)
                .send(buildGamePayload(editableEventId, false))
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .put(`/api/games/${editableGameId}`)
                .set('Authorization', authHeader)
                .send(buildGamePayload(editableEventId, false))
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .put(`/api/games/${editableGameId}`)
                .set('Authorization', authHeader)
                .send(buildGamePayload(editableEventId, false))
        );
    });

    describe('Delete game (in own club)', () => {
        let deletableEventId: number;
        let deletableGameId: number;

        beforeEach(() => {
            deletableEventId = nextId();
            insertEvent(
                deletableEventId,
                `Permissions Matrix Delete Game Event ${deletableEventId}`,
                TEST_CLUB_ID,
                OWN_CLUB_GAME_RULES_ID
            );

            deletableGameId = nextId();
            insertGame(deletableGameId, deletableEventId);
        });

        afterEach(() => {
            cleanupEventCascade(deletableEventId);
        });

        createRoleTest(
            'admin',
            204,
            (authHeader) => request(app)
                .delete(`/api/games/${deletableGameId}`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'owner',
            204,
            (authHeader) => request(app)
                .delete(`/api/games/${deletableGameId}`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'moderator',
            403,
            (authHeader) => request(app)
                .delete(`/api/games/${deletableGameId}`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .delete(`/api/games/${deletableGameId}`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .delete(`/api/games/${deletableGameId}`)
                .set('Authorization', authHeader)
        );
    });

    describe('Assign moderator (own club)', () => {
        beforeEach(() => {
            upsertMembership(TEST_CLUB_ID, MEMBER_USER_ID, 'MEMBER', 'ACTIVE');
        });

        createRoleTest(
            'admin',
            200,
            (authHeader) => request(app)
                .patch(`/api/clubs/${TEST_CLUB_ID}/members/${MEMBER_USER_ID}`)
                .set('Authorization', authHeader)
                .send({ role: 'MODERATOR' })
        );

        createRoleTest(
            'owner',
            200,
            (authHeader) => request(app)
                .patch(`/api/clubs/${TEST_CLUB_ID}/members/${MEMBER_USER_ID}`)
                .set('Authorization', authHeader)
                .send({ role: 'MODERATOR' })
        );

        createRoleTest(
            'moderator',
            403,
            (authHeader) => request(app)
                .patch(`/api/clubs/${TEST_CLUB_ID}/members/${MEMBER_USER_ID}`)
                .set('Authorization', authHeader)
                .send({ role: 'MODERATOR' })
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .patch(`/api/clubs/${TEST_CLUB_ID}/members/${MEMBER_USER_ID}`)
                .set('Authorization', authHeader)
                .send({ role: 'MODERATOR' })
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .patch(`/api/clubs/${TEST_CLUB_ID}/members/${MEMBER_USER_ID}`)
                .set('Authorization', authHeader)
                .send({ role: 'MODERATOR' })
        );
    });

    describe('Approve club join (own club)', () => {
        beforeEach(() => {
            setUserStatus(PENDING_ACTIVATION_USER_ID, false, 'PENDING');
            upsertMembership(TEST_CLUB_ID, PENDING_ACTIVATION_USER_ID, 'MEMBER', 'PENDING');
        });

        createRoleTest(
            'admin',
            200,
            (authHeader) => request(app)
                .post(`/api/clubs/${TEST_CLUB_ID}/members/${PENDING_ACTIVATION_USER_ID}/activate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'owner',
            200,
            (authHeader) => request(app)
                .post(`/api/clubs/${TEST_CLUB_ID}/members/${PENDING_ACTIVATION_USER_ID}/activate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'moderator',
            200,
            (authHeader) => request(app)
                .post(`/api/clubs/${TEST_CLUB_ID}/members/${PENDING_ACTIVATION_USER_ID}/activate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .post(`/api/clubs/${TEST_CLUB_ID}/members/${PENDING_ACTIVATION_USER_ID}/activate`)
                .set('Authorization', authHeader)
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .post(`/api/clubs/${TEST_CLUB_ID}/members/${PENDING_ACTIVATION_USER_ID}/activate`)
                .set('Authorization', authHeader)
        );
    });

    describe('View all clubs', () => {
        createRoleTest(
            'admin',
            200,
            (authHeader) => request(app).get('/api/clubs').set('Authorization', authHeader)
        );

        createRoleTest(
            'owner',
            200,
            (authHeader) => request(app).get('/api/clubs').set('Authorization', authHeader)
        );

        createRoleTest(
            'moderator',
            200,
            (authHeader) => request(app).get('/api/clubs').set('Authorization', authHeader)
        );

        createRoleTest(
            'member',
            200,
            (authHeader) => request(app).get('/api/clubs').set('Authorization', authHeader)
        );

        createRoleTest(
            'nonMember',
            200,
            (authHeader) => request(app).get('/api/clubs').set('Authorization', authHeader)
        );
    });

    describe('Manage global events (clubId=null)', () => {
        const createdEventIds = new Set<number>();

        afterEach(() => {
            for (const eventId of createdEventIds) {
                cleanupEventCascade(eventId);
            }
            createdEventIds.clear();
        });

        createRoleTest(
            'admin',
            201,
            (authHeader) => request(app)
                .post('/api/events')
                .set('Authorization', authHeader)
                .send(buildEventPayload(null, GLOBAL_GAME_RULES_ID)),
            (response) => captureCreatedId(response, createdEventIds)
        );

        createRoleTest(
            'owner',
            403,
            (authHeader) => request(app)
                .post('/api/events')
                .set('Authorization', authHeader)
                .send(buildEventPayload(null, GLOBAL_GAME_RULES_ID)),
            (response) => captureCreatedId(response, createdEventIds)
        );

        createRoleTest(
            'moderator',
            403,
            (authHeader) => request(app)
                .post('/api/events')
                .set('Authorization', authHeader)
                .send(buildEventPayload(null, GLOBAL_GAME_RULES_ID)),
            (response) => captureCreatedId(response, createdEventIds)
        );

        createRoleTest(
            'member',
            403,
            (authHeader) => request(app)
                .post('/api/events')
                .set('Authorization', authHeader)
                .send(buildEventPayload(null, GLOBAL_GAME_RULES_ID)),
            (response) => captureCreatedId(response, createdEventIds)
        );

        createRoleTest(
            'nonMember',
            403,
            (authHeader) => request(app)
                .post('/api/events')
                .set('Authorization', authHeader)
                .send(buildEventPayload(null, GLOBAL_GAME_RULES_ID)),
            (response) => captureCreatedId(response, createdEventIds)
        );
    });

    describe('Multi-club scenarios (role independence)', () => {
        const CLUB_B_ID = 95200;
        const CLUB_B_GAME_RULES_ID = 95210;
        let clubBEventId: number;
        let clubBGameId: number;

        beforeAll(() => {
            insertClub(CLUB_B_ID, 'Permissions Matrix Club B');
            insertGameRules(CLUB_B_GAME_RULES_ID, 'Permissions Matrix Club B Rules', 3, 40000, CLUB_B_ID);

            upsertMembership(CLUB_B_ID, OWNER_USER_ID, 'MEMBER', 'ACTIVE');
            upsertMembership(CLUB_B_ID, MODERATOR_USER_ID, 'MEMBER', 'ACTIVE');
            upsertMembership(CLUB_B_ID, MEMBER_USER_ID, 'OWNER', 'ACTIVE');

            const eventId = nextId();
            insertEvent(eventId, 'Permissions Matrix Club B Event', CLUB_B_ID, CLUB_B_GAME_RULES_ID);
            clubBEventId = eventId;

            const gameId = nextId();
            insertGame(gameId, clubBEventId);
            clubBGameId = gameId;
        });

        afterAll(() => {
            cleanupEventCascade(clubBEventId);
            dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(CLUB_B_ID);
            dbManager.db.prepare('DELETE FROM gameRules WHERE id = ?').run(CLUB_B_GAME_RULES_ID);
            dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(CLUB_B_ID);
        });

        test('OWNER in Club A is only MEMBER in Club B — CANNOT edit Club B', async () => {
            const res = await request(app)
                .put(`/api/clubs/${CLUB_B_ID}`)
                .set('Authorization', authHeaders.owner)
                .send({
                    name: 'Permissions Matrix Club B',
                    address: null, city: null, description: null, contactInfo: null,
                    isActive: true
                });
            expect(res.status).toBe(403);
        });

        test('OWNER in Club A is only MEMBER in Club B — CANNOT create event in Club B', async () => {
            const res = await request(app)
                .post('/api/events')
                .set('Authorization', authHeaders.owner)
                .send(buildEventPayload(CLUB_B_ID, CLUB_B_GAME_RULES_ID));
            expect(res.status).toBe(403);
        });

        test('OWNER in Club A is only MEMBER in Club B — CANNOT edit game in Club B', async () => {
            const res = await request(app)
                .put(`/api/games/${clubBGameId}`)
                .set('Authorization', authHeaders.owner)
                .send({
                    eventId: clubBEventId,
                    playersData: [
                        { userId: OWNER_USER_ID, points: 45000 },
                        { userId: MODERATOR_USER_ID, points: 40000 },
                        { userId: MEMBER_USER_ID, points: 35000 }
                    ]
                });
            expect(res.status).toBe(403);
        });

        test('OWNER in Club A is only MEMBER in Club B — CANNOT delete game in Club B', async () => {
            const res = await request(app)
                .delete(`/api/games/${clubBGameId}`)
                .set('Authorization', authHeaders.owner);
            expect(res.status).toBe(403);
        });

        test('MEMBER in Club A is OWNER in Club B — CAN edit Club B', async () => {
            const res = await request(app)
                .put(`/api/clubs/${CLUB_B_ID}`)
                .set('Authorization', authHeaders.member)
                .send({
                    name: 'Permissions Matrix Club B',
                    address: null, city: null, description: null, contactInfo: null,
                    isActive: true
                });
            expect(res.status).toBe(200);
        });

        test('MEMBER in Club A is OWNER in Club B — CAN create event in Club B', async () => {
            const res = await request(app)
                .post('/api/events')
                .set('Authorization', authHeaders.member)
                .send(buildEventPayload(CLUB_B_ID, CLUB_B_GAME_RULES_ID));
            if (res.body.id) {
                dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(res.body.id);
            }
            expect(res.status).toBe(201);
        });

        test('MEMBER in Club A is OWNER in Club B — CAN delete game in Club B', async () => {
            const tempGameId = nextId();
            insertGame(tempGameId, clubBEventId);
            const res = await request(app)
                .delete(`/api/games/${tempGameId}`)
                .set('Authorization', authHeaders.member);
            expect(res.status).toBe(204);
        });

        test('MEMBER in Club A is OWNER in Club B — still CANNOT edit Club A', async () => {
            const res = await request(app)
                .put(`/api/clubs/${TEST_CLUB_ID}`)
                .set('Authorization', authHeaders.member)
                .send({
                    name: 'Permissions Matrix Test Club',
                    address: null, city: null, description: null, contactInfo: null,
                    isActive: true
                });
            expect(res.status).toBe(403);
        });
    });
});
