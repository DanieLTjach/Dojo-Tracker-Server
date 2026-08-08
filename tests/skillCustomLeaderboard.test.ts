import request from 'supertest';
import express from 'express';
import skillRoutes from '../src/routes/SkillRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';
import {
    invalidateSkillReplayCache,
    skillReplayCacheSize,
    SkillRatingService,
} from '../src/service/SkillRatingService.ts';

const app = express();
app.use(express.json());
app.use('/api', skillRoutes);
app.use(handleErrors);

const SYSTEM_USER_ID = 0;
const authHeader = createAuthHeader(SYSTEM_USER_ID);

// High, file-unique id range to avoid collisions with other suites.
const U = [947001, 947002, 947003, 947004] as const;
const EVENT_TAGGED = 947101;
const EVENT_UNTAGGED = 947102;

function seed() {
    const db = dbManager.db;
    const ts = '2026-03-01T00:00:00.000Z';

    for (const id of U) {
        db.prepare(`
            INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
            VALUES (?, ?, ?, ?, ?, ?, 0, 1, 0, 'ACTIVE')
        `).run(id, `CustomLB ${id}`, `custom_lb_${id}`, id, ts, ts);
    }

    for (const [eventId, name] of [[EVENT_TAGGED, 'Tagged Event'], [EVENT_UNTAGGED, 'Untagged Event']] as const) {
        db.prepare(`
            INSERT INTO event (id, name, type, gameRules, clubId, isRated, createdAt, modifiedAt, modifiedBy)
            VALUES (?, ?, 'TOURNAMENT', 1, 1, 1, ?, ?, 0)
        `).run(eventId, name, ts, ts);
    }

    db.prepare(`INSERT INTO eventToTag (eventId, tag, createdAt, modifiedBy) VALUES (?, 'EMA', ?, 0)`)
        .run(EVENT_TAGGED, ts);

    // Same finishing order every game so the ranking is unambiguous.
    let gameId = 947200;
    const addGames = (eventId: number, count: number) => {
        for (let n = 0; n < count; n++) {
            const createdAt = `2026-03-${String(n + 1).padStart(2, '0')}T12:00:00.000Z`;
            db.prepare(`
                INSERT INTO game (id, eventId, status, createdAt, modifiedAt, modifiedBy)
                VALUES (?, ?, 'FINISHED', ?, ?, 0)
            `).run(gameId, eventId, createdAt, createdAt);

            const points = [40000, 30000, 25000, 5000];
            U.forEach((userId, i) => {
                db.prepare(`
                    INSERT INTO userToGame (userId, gameId, startPlace, points, chomboCount, isSubstitutePlayer, createdAt, modifiedAt, modifiedBy)
                    VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0)
                `).run(userId, gameId, ['EAST', 'SOUTH', 'WEST', 'NORTH'][i], points[i], createdAt, createdAt);
            });
            gameId++;
        }
    };

    addGames(EVENT_TAGGED, 5);
    addGames(EVENT_UNTAGGED, 5);
}

describe('Custom skill leaderboard', () => {
    beforeAll(() => {
        seed();
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('requires authentication', async () => {
        const res = await request(app).get('/api/skill/leaderboard');
        expect(res.status).toBe(401);
    });

    it('ranks players from all clubs when no clubId is given', async () => {
        const res = await request(app)
            .get('/api/skill/leaderboard?threshold=10')
            .set('Authorization', authHeader);

        expect(res.status).toBe(200);
        expect(res.body.clubId).toBeNull();
        expect(res.body.gamesProcessed).toBeGreaterThanOrEqual(10);

        const names = res.body.entries.map((e: { userId: number }) => e.userId);
        // The consistent winner must outrank the consistent last place.
        expect(names.indexOf(U[0])).toBeLessThan(names.indexOf(U[3]));
    });

    it('restricts games to the requested tag', async () => {
        const tagged = await request(app)
            .get('/api/skill/leaderboard?tags=EMA&threshold=5')
            .set('Authorization', authHeader);
        const all = await request(app)
            .get('/api/skill/leaderboard?threshold=5')
            .set('Authorization', authHeader);

        expect(tagged.status).toBe(200);
        expect(tagged.body.tags).toEqual(['EMA']);
        expect(tagged.body.gamesProcessed).toBeLessThan(all.body.gamesProcessed);
    });

    it('splits ranked and provisional on the threshold', async () => {
        const low = await request(app)
            .get('/api/skill/leaderboard?tags=EMA&threshold=5')
            .set('Authorization', authHeader);
        const high = await request(app)
            .get('/api/skill/leaderboard?tags=EMA&threshold=999')
            .set('Authorization', authHeader);

        expect(low.body.entries.length).toBeGreaterThan(0);
        expect(high.body.entries).toHaveLength(0);
        expect(high.body.provisionalEntries.length).toBeGreaterThan(0);
    });

    it('excludes a filler player even in events where the registration row is missing', async () => {
        // Mirrors the imported 2023-24 tournaments: a placeholder seat with game
        // rows, flagged a filler in one event but with no registration in another.
        const db = dbManager.db;
        const ts = '2026-03-01T00:00:00.000Z';
        const fillerId = 947900;
        const flaggedEvent = 947103;

        db.prepare(`
            INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
            VALUES (?, 'Filler Seat', 'filler_seat_947', ?, ?, ?, 0, 1, 0, 'ACTIVE')
        `).run(fillerId, fillerId, ts, ts);

        db.prepare(`
            INSERT INTO event (id, name, type, gameRules, clubId, isRated, createdAt, modifiedAt, modifiedBy)
            VALUES (?, 'Filler Flagged Event', 'TOURNAMENT', 1, 1, 1, ?, ?, 0)
        `).run(flaggedEvent, ts, ts);

        db.prepare(`
            INSERT INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy, isFillerPlayer)
            VALUES (?, ?, 'APPROVED', ?, ?, 0, 1)
        `).run(flaggedEvent, fillerId, ts, ts);

        // Games live in EVENT_UNTAGGED, where the filler has NO registration row.
        let gameId = 947400;
        for (let n = 0; n < 6; n++) {
            const createdAt = `2026-04-${String(n + 1).padStart(2, '0')}T12:00:00.000Z`;
            db.prepare(`
                INSERT INTO game (id, eventId, status, createdAt, modifiedAt, modifiedBy)
                VALUES (?, ?, 'FINISHED', ?, ?, 0)
            `).run(gameId, EVENT_UNTAGGED, createdAt, createdAt);

            const seats = [U[0], U[1], U[2], fillerId];
            const points = [40000, 30000, 25000, 5000];
            seats.forEach((userId, i) => {
                db.prepare(`
                    INSERT INTO userToGame (userId, gameId, startPlace, points, chomboCount, isSubstitutePlayer, createdAt, modifiedAt, modifiedBy)
                    VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0)
                `).run(userId, gameId, ['EAST', 'SOUTH', 'WEST', 'NORTH'][i], points[i], createdAt, createdAt);
            });
            gameId++;
        }

        const res = await request(app)
            .get('/api/skill/leaderboard?threshold=1')
            .set('Authorization', authHeader);

        expect(res.status).toBe(200);
        const allIds = [...res.body.entries, ...res.body.provisionalEntries]
            .map((e: { userId: number }) => e.userId);
        expect(allIds).not.toContain(fillerId);
    });

    it('honours matchAll=false as OR, not AND', async () => {
        // z.coerce.boolean() would make this true (Boolean('false') === true) and
        // silently return the AND-tag board.
        const orBoard = await request(app)
            .get('/api/skill/leaderboard?tags=EMA,LEAGUE&matchAll=false&threshold=1')
            .set('Authorization', authHeader);
        const andBoard = await request(app)
            .get('/api/skill/leaderboard?tags=EMA,LEAGUE&matchAll=true&threshold=1')
            .set('Authorization', authHeader);

        expect(orBoard.status).toBe(200);
        expect(orBoard.body.matchAll).toBe(false);
        expect(andBoard.body.matchAll).toBe(true);
        // No event carries both tags, so AND matches nothing while OR matches the EMA event.
        expect(orBoard.body.gamesProcessed).toBeGreaterThan(andBoard.body.gamesProcessed);
    });

    it('rejects a threshold above the cap with 400', async () => {
        const res = await request(app)
            .get('/api/skill/leaderboard?threshold=100000')
            .set('Authorization', authHeader);

        expect(res.status).toBe(400);
    });

    describe('replay cache', () => {
        it('serves a repeat request from cache', async () => {
            invalidateSkillReplayCache();
            expect(skillReplayCacheSize()).toBe(0);

            const first = await request(app)
                .get('/api/skill/leaderboard?threshold=1')
                .set('Authorization', authHeader);
            expect(first.status).toBe(200);
            expect(skillReplayCacheSize()).toBe(1);

            const second = await request(app)
                .get('/api/skill/leaderboard?threshold=1')
                .set('Authorization', authHeader);
            expect(second.body.entries).toEqual(first.body.entries);
            expect(skillReplayCacheSize()).toBe(1);
        });

        it('treats differently ordered tags as the same entry', async () => {
            invalidateSkillReplayCache();

            await request(app)
                .get('/api/skill/leaderboard?tags=EMA,LEAGUE&threshold=1')
                .set('Authorization', authHeader);
            await request(app)
                .get('/api/skill/leaderboard?tags=LEAGUE,EMA&threshold=1')
                .set('Authorization', authHeader);

            expect(skillReplayCacheSize()).toBe(1);
        });

        it('keeps separate entries per filter', async () => {
            invalidateSkillReplayCache();

            await request(app).get('/api/skill/leaderboard?threshold=1').set('Authorization', authHeader);
            await request(app).get('/api/skill/leaderboard?tags=EMA&threshold=1').set('Authorization', authHeader);
            await request(app).get('/api/skill/leaderboard?gameSize=3&threshold=1').set('Authorization', authHeader);

            expect(skillReplayCacheSize()).toBe(3);
        });

        it('reflects a newly finished game rather than serving a stale board', async () => {
            const before = await request(app)
                .get('/api/skill/leaderboard?threshold=1')
                .set('Authorization', authHeader);
            const gamesBefore = before.body.gamesProcessed;
            expect(skillReplayCacheSize()).toBeGreaterThan(0);

            // A new game must evict the cached replay.
            const ts = '2026-05-01T12:00:00.000Z';
            const gameId = 947500;
            dbManager.db.prepare(`
                INSERT INTO game (id, eventId, status, createdAt, modifiedAt, modifiedBy)
                VALUES (?, ?, 'FINISHED', ?, ?, 0)
            `).run(gameId, EVENT_UNTAGGED, ts, ts);
            const points = [40000, 30000, 25000, 5000];
            U.forEach((userId, i) => {
                dbManager.db.prepare(`
                    INSERT INTO userToGame (userId, gameId, startPlace, points, chomboCount, isSubstitutePlayer, createdAt, modifiedAt, modifiedBy)
                    VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0)
                `).run(userId, gameId, ['EAST', 'SOUTH', 'WEST', 'NORTH'][i], points[i], ts, ts);
            });

            new SkillRatingService().applyFinishedGame(gameId);
            expect(skillReplayCacheSize()).toBe(0);

            const after = await request(app)
                .get('/api/skill/leaderboard?threshold=1')
                .set('Authorization', authHeader);
            expect(after.body.gamesProcessed).toBe(gamesBefore + 1);
        });
    });

    it('rejects an unknown tag with 400', async () => {
        const res = await request(app)
            .get('/api/skill/leaderboard?tags=NOT_A_TAG')
            .set('Authorization', authHeader);

        expect(res.status).toBe(400);
        expect(res.body.errorCode).toBe('unknownEventTag');
    });

    it('rejects an invalid gameSize with 400', async () => {
        const res = await request(app)
            .get('/api/skill/leaderboard?gameSize=5')
            .set('Authorization', authHeader);

        expect(res.status).toBe(400);
    });

    it('stores nothing — a call leaves skillRating untouched', async () => {
        const before = dbManager.db.prepare('SELECT COUNT(*) as c FROM skillRating').get() as { c: number };

        const res = await request(app)
            .get('/api/skill/leaderboard?threshold=1')
            .set('Authorization', authHeader);
        expect(res.status).toBe(200);
        expect(res.body.entries.length).toBeGreaterThan(0);

        const after = dbManager.db.prepare('SELECT COUNT(*) as c FROM skillRating').get() as { c: number };
        expect(after.c).toBe(before.c);
    });

    it('unfiltered replay agrees with the stored recompute', async () => {
        // The shared replayGames is what guarantees this; if the ad-hoc path
        // ever grows its own loop, this test is what catches the divergence.
        const service = new SkillRatingService();
        service.recomputeTrack(1, 4);

        const stored = service.getClubLeaderboard(1, 4);
        const adHoc = service.getCustomLeaderboard({
            clubId: 1,
            gameSize: 4,
            tags: [],
            matchAll: false,
            eventType: null,
            provisionalGameThreshold: stored.provisionalGameThreshold,
        });

        const storedById = new Map(
            [...stored.entries, ...stored.provisionalEntries].map(e => [e.userId, e])
        );
        const adHocById = new Map(
            [...adHoc.entries, ...adHoc.provisionalEntries].map(e => [e.userId, e])
        );

        expect(adHocById.size).toBe(storedById.size);
        for (const [userId, storedEntry] of storedById.entries()) {
            const adHocEntry = adHocById.get(userId);
            expect(adHocEntry).toBeDefined();
            expect(adHocEntry!.gamesPlayed).toBe(storedEntry.gamesPlayed);
            expect(adHocEntry!.mu).toBeCloseTo(storedEntry.mu, 9);
            expect(adHocEntry!.sigma).toBeCloseTo(storedEntry.sigma, 9);
        }
    });
});
