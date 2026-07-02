import express from 'express';
import request from 'supertest';
import eventRoutes from '../src/routes/EventRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createCustomEvent } from './testHelpers.ts';

const SYSTEM_USER_ID = 0;
const TOURNAMENT_EVENT_ID = 99500;
const SEASON_EVENT_ID = 99501;
const TEST_CLUB_ID = 1;
const GAME_RULES_ID = 2;
const OWNER_USER_ID = 99590;
const MODERATOR_USER_ID = 99591;
const OUTSIDER_USER_ID = 99592;
// Two tables' worth of players (8). Two tables only support one no-repeat round, so the
// tournament is configured for a single round; the apply/clear flow still spans 2 tables.
const PLAYER_IDS = [99501, 99502, 99503, 99504, 99505, 99506, 99507, 99508] as const;
const TOTAL_ROUNDS = 1;

const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);
app.use(handleErrors);

const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
const moderatorAuthHeader = createAuthHeader(MODERATOR_USER_ID);
const outsiderAuthHeader = createAuthHeader(OUTSIDER_USER_ID);

function insertApprovedRegistration(eventId: number, userId: number): void {
    const ts = '2024-01-01T00:00:00.000Z';
    dbManager.db.prepare(
        `INSERT OR REPLACE INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
         VALUES (?, ?, 'APPROVED', ?, ?, 0)`
    ).run(eventId, userId, ts, ts);
}

function cleanupEvent(eventId: number): void {
    dbManager.db.prepare('DELETE FROM gameRound WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(eventId);
    dbManager.db.prepare('DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(eventId);
    dbManager.db.prepare('DELETE FROM userRatingChange WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM tournament WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(eventId);
}

function gameCount(eventId: number): number {
    return (dbManager.db.prepare('SELECT COUNT(*) as count FROM game WHERE eventId = ?').get(eventId) as {
        count: number;
    }).count;
}

describe('Tournament seating generation', () => {
    beforeAll(() => {
        const ts = '2024-01-01T00:00:00.000Z';
        for (const userId of [...PLAYER_IDS, OWNER_USER_ID, MODERATOR_USER_ID, OUTSIDER_USER_ID]) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, 0, 1, 'ACTIVE', ?, ?, 0)`
            ).run(userId, `Seating User ${userId}`, `@seating_${userId}`, userId + 2000000, ts, ts);
        }
        for (const userId of PLAYER_IDS) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
            ).run(TEST_CLUB_ID, userId, ts, ts);
        }
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'OWNER', 'ACTIVE', ?, ?, 0)`
        ).run(TEST_CLUB_ID, OWNER_USER_ID, ts, ts);
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'MODERATOR', 'ACTIVE', ?, ?, 0)`
        ).run(TEST_CLUB_ID, MODERATOR_USER_ID, ts, ts);
    });

    beforeEach(() => {
        createCustomEvent(
            TOURNAMENT_EVENT_ID,
            'Seating Tournament',
            '2026-01-01T00:00:00.000Z',
            '2030-01-01T00:00:00.000Z',
            GAME_RULES_ID,
            TEST_CLUB_ID,
            'TOURNAMENT',
            TOTAL_ROUNDS
        );
        for (const userId of PLAYER_IDS) {
            insertApprovedRegistration(TOURNAMENT_EVENT_ID, userId);
        }
    });

    afterEach(() => {
        cleanupEvent(TOURNAMENT_EVENT_ID);
        cleanupEvent(SEASON_EVENT_ID);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM clubMembership WHERE userId IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            ...PLAYER_IDS,
            OWNER_USER_ID,
            MODERATOR_USER_ID,
            OUTSIDER_USER_ID
        );
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            ...PLAYER_IDS,
            OWNER_USER_ID,
            MODERATOR_USER_ID,
            OUTSIDER_USER_ID
        );
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('POST /tournament/seating/generate', () => {
        it('returns candidate seatings derived from approved participants and round count', async () => {
            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/generate`)
                .set('Authorization', adminAuthHeader)
                .send({ timeLimitMs: 1000, candidateCount: 2, seed: 123 });

            expect(response.status).toBe(200);
            expect(response.body.tables).toBe(2);
            expect(response.body.rounds).toBe(TOTAL_ROUNDS);
            expect(response.body.participantCount).toBe(PLAYER_IDS.length);
            expect(response.body.candidates.length).toBeGreaterThanOrEqual(1);

            const candidate = response.body.candidates[0];
            expect(candidate.rounds).toHaveLength(TOTAL_ROUNDS);
            // Every seat references an approved participant with a valid wind.
            const winds = new Set(['EAST', 'SOUTH', 'WEST', 'NORTH']);
            for (const round of candidate.rounds) {
                expect(round).toHaveLength(2);
                const usersThisRound = new Set<number>();
                for (const table of round) {
                    expect(table).toHaveLength(4);
                    for (const seat of table) {
                        expect(PLAYER_IDS).toContain(seat.userId);
                        expect(winds.has(seat.seat)).toBe(true);
                        usersThisRound.add(seat.userId);
                    }
                }
                expect(usersThisRound.size).toBe(PLAYER_IDS.length);
            }
        });

        it('is deterministic for a given seed', async () => {
            const send = () =>
                request(app)
                    .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/generate`)
                    .set('Authorization', adminAuthHeader)
                    .send({ timeLimitMs: 1000, candidateCount: 1, seed: 777 });

            const first = await send();
            const second = await send();
            expect(first.body.candidates[0].rounds).toEqual(second.body.candidates[0].rounds);
        });

        it('allows a club moderator to generate', async () => {
            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/generate`)
                .set('Authorization', moderatorAuthHeader)
                .send({ timeLimitMs: 1000, seed: 1 });
            expect(response.status).toBe(200);
        });

        it('rejects a non-manager user', async () => {
            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/generate`)
                .set('Authorization', outsiderAuthHeader)
                .send({ timeLimitMs: 1000, seed: 1 });
            expect(response.status).toBe(403);
        });

        it('rejects an unauthenticated request', async () => {
            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/generate`)
                .send({});
            expect(response.status).toBe(401);
        });

        it('rejects generation for a non-tournament event', async () => {
            createCustomEvent(SEASON_EVENT_ID, 'Seating Season');
            const response = await request(app)
                .post(`/api/events/${SEASON_EVENT_ID}/tournament/seating/generate`)
                .set('Authorization', adminAuthHeader)
                .send({});
            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('eventIsNotTournament');
        });

        it('rejects when the participant count is not a multiple of four', async () => {
            insertApprovedRegistration(TOURNAMENT_EVENT_ID, OUTSIDER_USER_ID); // makes 9
            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/generate`)
                .set('Authorization', adminAuthHeader)
                .send({});
            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('seatingParticipantsNotMultipleOfTableSize');
        });

        it('rejects generation once the tournament has started', async () => {
            dbManager.db.prepare('UPDATE tournament SET status = ?, currentRound = 1 WHERE eventId = ?').run(
                'IN_PROGRESS',
                TOURNAMENT_EVENT_ID
            );
            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/generate`)
                .set('Authorization', adminAuthHeader)
                .send({});
            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('seatingCannotBeModifiedAfterTournamentStarted');
        });
    });

    describe('POST /tournament/seating/apply and DELETE /tournament/seating', () => {
        async function generate(): Promise<number[][][]> {
            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/generate`)
                .set('Authorization', adminAuthHeader)
                .send({ timeLimitMs: 1000, candidateCount: 1, seed: 42 });
            expect(response.status).toBe(200);
            // Convert the chosen candidate into the apply payload (user ids in seat order).
            return response.body.candidates[0].rounds.map((round: { userId: number }[][]) =>
                round.map(table => table.map(seat => seat.userId))
            );
        }

        it('creates CREATED tournament games for the chosen seating', async () => {
            const rounds = await generate();

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/apply`)
                .set('Authorization', adminAuthHeader)
                .send({ rounds });

            expect(response.status).toBe(201);
            expect(response.body.created).toBe(TOTAL_ROUNDS * 2); // 2 rounds x 2 tables
            expect(gameCount(TOURNAMENT_EVENT_ID)).toBe(TOTAL_ROUNDS * 2);
            for (const game of response.body.games) {
                expect(game.status).toBe('CREATED');
            }
        });

        it('clears generated games so a new seating can be produced', async () => {
            const rounds = await generate();
            await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/apply`)
                .set('Authorization', adminAuthHeader)
                .send({ rounds })
                .expect(201);
            expect(gameCount(TOURNAMENT_EVENT_ID)).toBe(TOTAL_ROUNDS * 2);

            const clearResponse = await request(app)
                .delete(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating`)
                .set('Authorization', adminAuthHeader);

            expect(clearResponse.status).toBe(200);
            expect(clearResponse.body.deleted).toBe(TOTAL_ROUNDS * 2);
            expect(gameCount(TOURNAMENT_EVENT_ID)).toBe(0);
        });

        it('rejects applying a second seating before clearing the first', async () => {
            const rounds = await generate();
            await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/apply`)
                .set('Authorization', adminAuthHeader)
                .send({ rounds })
                .expect(201);

            const second = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/apply`)
                .set('Authorization', adminAuthHeader)
                .send({ rounds });

            expect(second.status).toBe(400);
            expect(second.body.errorCode).toBe('seatingAlreadyApplied');
        });

        it('rejects applying a seating that references a non-participant', async () => {
            const rounds = await generate();
            rounds[0]![0]![0] = OUTSIDER_USER_ID; // not an approved participant

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/apply`)
                .set('Authorization', adminAuthHeader)
                .send({ rounds });

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('seatingInvalidParticipant');
            expect(gameCount(TOURNAMENT_EVENT_ID)).toBe(0);
        });

        it('rejects apply once the tournament has started', async () => {
            const rounds = await generate();
            dbManager.db.prepare('UPDATE tournament SET status = ?, currentRound = 1 WHERE eventId = ?').run(
                'IN_PROGRESS',
                TOURNAMENT_EVENT_ID
            );

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/seating/apply`)
                .set('Authorization', adminAuthHeader)
                .send({ rounds });

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('seatingCannotBeModifiedAfterTournamentStarted');
        });
    });

    describe('Team tournament seating seats only teamed players', () => {
        const TEAM_EVENT_ID = 99510;
        // 8 teamed players (four teams of two) plus one approved-but-undrafted reserve.
        // teamCount is 4 (divisible by 4, as seating requires) and the 8 teamed players
        // are a multiple of the 4-per-table size.
        const TEAM_PLAYER_IDS = [99520, 99521, 99522, 99523, 99524, 99525, 99526, 99527] as const;
        const RESERVE_ID = 99528;
        const ALL_IDS = [...TEAM_PLAYER_IDS, RESERVE_ID];

        beforeEach(() => {
            const ts = '2024-01-01T00:00:00.000Z';
            for (const userId of ALL_IDS) {
                dbManager.db.prepare(
                    `INSERT OR IGNORE INTO user (id, name, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 0, 1, 'ACTIVE', ?, ?, 0)`
                ).run(userId, `Team Seating ${userId}`, ts, ts);
                dbManager.db.prepare(
                    `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
                ).run(TEST_CLUB_ID, userId, ts, ts);
            }
            // TEAM tournament with teamConfig {teamSize:4, teamCount:2} in DRAFT.
            dbManager.db.prepare(
                `INSERT INTO event (id, name, type, format, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, config, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Team Seating Tournament', 'TOURNAMENT', 'TEAM', ?, ?, '2026-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z', 0, 0, '{"teamConfig":{"teamSize":2,"teamCount":4},"minParticipants":8}', ?, ?, 0)`
            ).run(TEAM_EVENT_ID, GAME_RULES_ID, TEST_CLUB_ID, ts, ts);
            dbManager.db.prepare(
                `INSERT INTO tournament (eventId, status, totalRounds, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'DRAFT', 1, ?, ?, 0)`
            ).run(TEAM_EVENT_ID, ts, ts);
            for (const userId of ALL_IDS) {
                insertApprovedRegistration(TEAM_EVENT_ID, userId);
            }

            // Draft four full teams of two; the reserve is left undrafted.
            for (let team = 0; team < 4; team++) {
                const teamId = 99530 + team;
                dbManager.db.prepare(
                    `INSERT INTO team (id, eventId, name, createdAt, modifiedAt, modifiedBy) VALUES (?, ?, ?, ?, ?, 0)`
                ).run(teamId, TEAM_EVENT_ID, `T${team}`, ts, ts);
                for (let i = 0; i < 2; i++) {
                    const userId = TEAM_PLAYER_IDS[team * 2 + i]!;
                    dbManager.db.prepare(
                        `INSERT INTO teamMembership (teamId, eventId, userId, role, createdAt, modifiedAt, modifiedBy)
                     VALUES (?, ?, ?, ?, ?, ?, 0)`
                    ).run(teamId, TEAM_EVENT_ID, userId, i === 0 ? 'CAPTAIN' : 'MEMBER', ts, ts);
                }
            }
        });

        afterEach(() => {
            dbManager.db.prepare('DELETE FROM teamMembership WHERE eventId = ?').run(TEAM_EVENT_ID);
            dbManager.db.prepare('DELETE FROM team WHERE eventId = ?').run(TEAM_EVENT_ID);
            cleanupEvent(TEAM_EVENT_ID);
            dbManager.db.prepare(`DELETE FROM clubMembership WHERE userId IN (${ALL_IDS.join(',')})`).run();
            dbManager.db.prepare(`DELETE FROM user WHERE id IN (${ALL_IDS.join(',')})`).run();
        });

        it('seats the 8 teamed players and ignores the approved reserve (9 → 8, divisible by 4)', async () => {
            const response = await request(app)
                .post(`/api/events/${TEAM_EVENT_ID}/tournament/seating/generate`)
                .set('Authorization', adminAuthHeader)
                .send({ timeLimitMs: 1000, candidateCount: 2, seed: 123 });

            expect(response.status).toBe(200);
            // 9 approved, but only 8 are teamed → 2 tables, not a divisible-by-4 error.
            expect(response.body.participantCount).toBe(TEAM_PLAYER_IDS.length);
            expect(response.body.tables).toBe(2);

            const seatedIds = response.body.candidates[0].rounds[0].flat();
            expect(seatedIds).not.toContain(RESERVE_ID);
        });
    });
});
