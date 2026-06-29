import express from 'express';
import request from 'supertest';
import clubRoutes from '../src/routes/ClubRoutes.ts';
import eventRoutes from '../src/routes/EventRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createCustomEvent } from './testHelpers.ts';
import { UsageService } from '../src/service/UsageService.ts';
import { UsageAction } from '../src/model/UsageModels.ts';

const app = express();
app.use(express.json());
app.use('/api/clubs', clubRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/games', gameRoutes);
app.use(handleErrors);

describe('Usage credits', () => {
    const adminAuthHeader = createAuthHeader(0);
    const usageService = new UsageService();
    let clubId = 50;
    let userId = 500;

    beforeEach(() => {
        clubId++;
        userId++;
        const timestamp = new Date().toISOString();
        dbManager.db.prepare(
            `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, NULL, NULL, NULL, NULL, 1, ?, ?, 0)`
        ).run(clubId, `Usage Club ${clubId}`, timestamp, timestamp);

        dbManager.db.prepare(
            `INSERT INTO user (id, name, telegramUsername, telegramId, isActive, isAdmin, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, NULL, ?, 1, 0, ?, ?, 0)`
        ).run(userId, `Usage User ${userId}`, 900000 + userId, timestamp, timestamp);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    test('creates seeded accounts with starter credits and default cutoff', () => {
        const summary = usageService.getUsageSummary(1);

        expect(summary.account.creditsBalance).toBe(10000);
        expect(summary.account.overdraftCutoff).toBe(-1000);
        expect(summary.account.overdraftMultiplier).toBe(2);
        expect(summary.account.isEnforced).toBe(true);
    });

    test('charges daily usage and doubles charges after balance is negative', () => {
        usageService.ensureAccount(clubId, 0);

        const firstResult = usageService.runBillable(
            { clubId, action: UsageAction.SAVED_GAME_CREATED, modifiedBy: 0 },
            () => 'created'
        );
        expect(firstResult).toBe('created');
        expect(usageService.getUsageSummary(clubId).account.creditsBalance).toBe(9999);

        dbManager.db.prepare('UPDATE clubUsageAccount SET creditsBalance = -1 WHERE clubId = ?').run(clubId);

        usageService.runBillable(
            { clubId, action: UsageAction.TRACKED_ROUND_RESULT_CREATED, modifiedBy: 0, count: 3 },
            () => 'rounds'
        );

        const summary = usageService.getUsageSummary(clubId);
        expect(summary.account.creditsBalance).toBe(-7);
        expect(summary.dailyUsage).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: UsageAction.SAVED_GAME_CREATED,
                    actionCount: 1,
                    baseCredits: 1,
                    chargedCredits: 1,
                }),
                expect.objectContaining({
                    action: UsageAction.TRACKED_ROUND_RESULT_CREATED,
                    actionCount: 3,
                    baseCredits: 3,
                    chargedCredits: 6,
                }),
            ])
        );
    });

    test('blocks billable actions that would pass the cutoff', () => {
        usageService.ensureAccount(clubId, 0);
        dbManager.db.prepare('UPDATE clubUsageAccount SET creditsBalance = -999 WHERE clubId = ?').run(clubId);

        expect(() =>
            usageService.runBillable(
                { clubId, action: UsageAction.SAVED_GAME_CREATED, modifiedBy: 0 },
                () => 'blocked'
            )
        ).toThrow('does not have enough usage credits');

        expect(usageService.getUsageSummary(clubId).account.creditsBalance).toBe(-999);
    });

    test('lets system admins adjust credits and update cutoff through API', async () => {
        usageService.ensureAccount(clubId, 0);

        const adjustment = await request(app)
            .post(`/api/clubs/${clubId}/usage/adjustments`)
            .set('Authorization', adminAuthHeader)
            .send({ creditsDelta: 250, reason: 'External invoice paid', externalReference: 'INV-1' });

        expect(adjustment.status).toBe(201);
        expect(adjustment.body.account.creditsBalance).toBe(10250);
        expect(adjustment.body.adjustment).toMatchObject({
            creditsDelta: 250,
            reason: 'External invoice paid',
            externalReference: 'INV-1',
        });

        const cutoff = await request(app)
            .patch(`/api/clubs/${clubId}/usage/account`)
            .set('Authorization', adminAuthHeader)
            .send({ overdraftCutoff: -2500, reason: 'Trusted club' });

        expect(cutoff.status).toBe(200);
        expect(cutoff.body.account.overdraftCutoff).toBe(-2500);
        expect(cutoff.body.adjustment).toMatchObject({
            previousOverdraftCutoff: -1000,
            newOverdraftCutoff: -2500,
        });
    });

    test('charges event creates and refunds failed creates', async () => {
        usageService.ensureAccount(clubId, 0);

        const response = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Usage Charged Event',
                description: 'Created from usage test',
                type: 'SEASON',
                gameRulesId: 1,
                clubId,
                dateFrom: '2026-01-01T00:00:00.000Z',
                dateTo: '2026-12-31T00:00:00.000Z',
            });

        expect(response.status).toBe(201);
        expect(response.body.usageCredits).toMatchObject({
            action: UsageAction.EVENT_CREATED,
            chargedCredits: 1,
            creditsBalance: 9999,
        });
        expect(response.headers['x-usage-credits-charged']).toBe('1');

        const failed = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                type: 'SEASON',
                gameRulesId: 1,
                clubId,
            });

        expect(failed.status).toBe(400);
        expect(usageService.getUsageSummary(clubId).account.creditsBalance).toBe(9999);
    });

    test('charges saved game creates through the API', async () => {
        usageService.ensureAccount(clubId, 0);
        const players = [userId, insertActiveUser(), insertActiveUser(), insertActiveUser()];
        for (const playerId of players) {
            seedMembership(clubId, playerId, 'MEMBER');
        }

        const eventId = 3000 + clubId;
        createCustomEvent(
            eventId,
            `Usage Game Event ${clubId}`,
            '2026-01-01T00:00:00.000Z',
            '2026-12-31T00:00:00.000Z',
            1,
            clubId
        );

        const response = await request(app)
            .post('/api/games')
            .set('Authorization', createAuthHeader(userId))
            .send({
                eventId,
                playersData: [
                    { userId: players[0], points: 40000, startPlace: 'EAST' },
                    { userId: players[1], points: 35000, startPlace: 'SOUTH' },
                    { userId: players[2], points: 25000, startPlace: 'WEST' },
                    { userId: players[3], points: 20000, startPlace: 'NORTH' },
                ],
            });

        expect(response.status).toBe(201);
        expect(response.body.usageCredits).toMatchObject({
            action: UsageAction.SAVED_GAME_CREATED,
            chargedCredits: 1,
            creditsBalance: 9999,
        });
        expect(usageService.getUsageSummary(clubId).dailyUsage).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: UsageAction.SAVED_GAME_CREATED,
                    actionCount: 1,
                }),
            ])
        );
    });

    test('charges activating a club user once', async () => {
        usageService.ensureAccount(clubId, 0);
        seedMembership(clubId, userId, 'MEMBER', 'PENDING');

        const response = await request(app)
            .post(`/api/clubs/${clubId}/members/${userId}/activate`)
            .set('Authorization', adminAuthHeader);

        expect(response.status).toBe(200);
        expect(usageService.getUsageSummary(clubId).account.creditsBalance).toBe(9999);
        expect(usageService.getUsageSummary(clubId).dailyUsage).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: UsageAction.CLUB_USER_ADDED,
                    actionCount: 1,
                }),
            ])
        );
    });

    test('allows owners to view usage but keeps adjustments admin-only', async () => {
        usageService.ensureAccount(clubId, 0);
        seedMembership(clubId, userId, 'OWNER');

        const ownerAuthHeader = createAuthHeader(userId);
        const summary = await request(app)
            .get(`/api/clubs/${clubId}/usage`)
            .set('Authorization', ownerAuthHeader);

        expect(summary.status).toBe(200);
        expect(summary.body.account.clubId).toBe(clubId);

        const denied = await request(app)
            .post(`/api/clubs/${clubId}/usage/adjustments`)
            .set('Authorization', ownerAuthHeader)
            .send({ creditsDelta: 100, reason: 'Nope' });

        expect(denied.status).toBe(403);
        expect(denied.body.errorCode).toBe('insufficientPermissions');
    });

    function insertActiveUser(): number {
        userId++;
        const timestamp = new Date().toISOString();
        dbManager.db.prepare(
            `INSERT INTO user (id, name, telegramUsername, telegramId, isActive, isAdmin, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, NULL, ?, 1, 0, ?, ?, 0)`
        ).run(userId, `Usage Extra User ${userId}`, 900000 + userId, timestamp, timestamp);
        return userId;
    }

    function seedMembership(
        targetClubId: number,
        targetUserId: number,
        role: 'MEMBER' | 'MODERATOR' | 'OWNER',
        status: 'PENDING' | 'ACTIVE' | 'INACTIVE' = 'ACTIVE'
    ): void {
        const timestamp = new Date().toISOString();
        dbManager.db.prepare(
            `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, 0)`
        ).run(targetClubId, targetUserId, role, status, timestamp, timestamp);
    }
});
