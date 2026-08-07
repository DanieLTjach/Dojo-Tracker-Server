import request from 'supertest';
import express from 'express';
import skillRoutes from '../src/routes/SkillRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';
import { SkillRatingService } from '../src/service/SkillRatingService.ts';

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
