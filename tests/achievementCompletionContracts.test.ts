import request from 'supertest';
import express from 'express';
import userRoutes from '../src/routes/UserRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import eventRoutes from '../src/routes/EventRoutes.ts';
import achievementRoutes from '../src/routes/AchievementRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import { EventService } from '../src/service/EventService.ts';
import { Wind } from '../src/model/GameModels.ts';
import { ClubRepository } from '../src/repository/ClubRepository.ts';
import { ClubMembershipService } from '../src/service/ClubMembershipService.ts';

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/achievements', achievementRoutes);
app.use(handleErrors);

describe('Achievement completion and tournament contracts', () => {
    const SYSTEM_USER_ID = 0;
    let adminAuthHeader: string;
    let p1Id: number;
    let p2Id: number;
    let p3Id: number;
    let p4Id: number;
    let eventId: number;
    let tournamentEventId: number;
    let clubId: number;

    const userService = new UserService();
    const userRepository = new UserRepository();
    const eventService = new EventService();
    const clubRepository = new ClubRepository();
    const membershipService = new ClubMembershipService();

    beforeAll(() => {
        const u1 = userService.registerUser('UnlockP1', 'unlock_p1', 661101, SYSTEM_USER_ID);
        const u2 = userService.registerUser('UnlockP2', 'unlock_p2', 661102, SYSTEM_USER_ID);
        const u3 = userService.registerUser('UnlockP3', 'unlock_p3', 661103, SYSTEM_USER_ID);
        const u4 = userService.registerUser('UnlockP4', 'unlock_p4', 661104, SYSTEM_USER_ID);

        p1Id = u1.id;
        p2Id = u2.id;
        p3Id = u3.id;
        p4Id = u4.id;

        adminAuthHeader = createAuthHeader(p1Id);

        userRepository.updateUserStatus(p1Id, true, 'ACTIVE', p1Id);
        dbManager.db.prepare('UPDATE user SET isAdmin = 1 WHERE id = ?').run(p1Id);
        userRepository.updateUserStatus(p2Id, true, 'ACTIVE', p1Id);
        userRepository.updateUserStatus(p3Id, true, 'ACTIVE', p1Id);
        userRepository.updateUserStatus(p4Id, true, 'ACTIVE', p1Id);

        clubId = clubRepository.createClub({
            name: 'Achievement Test Club',
            address: null,
            city: null,
            country: 'UA',
            locale: 'en',
            description: null,
            contactInfo: null,
            isActive: true,
            createdAt: new Date(),
            modifiedBy: p1Id,
        });

        membershipService.createActiveMembership(clubId, p1Id, p1Id);
        membershipService.updateMemberRole(clubId, p1Id, 'OWNER', p1Id);
        membershipService.createActiveMembership(clubId, p2Id, p1Id);
        membershipService.createActiveMembership(clubId, p3Id, p1Id);
        membershipService.createActiveMembership(clubId, p4Id, p1Id);

        const regularEvent = eventService.createEvent({
            clubId,
            name: 'Achievement Test Event',
            type: 'SEASON',
            format: 'INDIVIDUAL',
            dateFrom: new Date('2026-01-01'),
            dateTo: new Date('2026-12-31'),
            gameRulesId: 2,
            startingRating: 1500,
            minimumGamesForRating: 10,
        }, p1Id);
        eventId = regularEvent.id;

        const tournamentEvent = eventService.createEvent({
            clubId,
            name: 'Achievement Test Tournament',
            type: 'TOURNAMENT',
            format: 'INDIVIDUAL',
            dateFrom: new Date('2026-01-01'),
            dateTo: new Date('2026-12-31'), // future dateTo
            gameRulesId: 2,
            startingRating: 1500,
            minimumGamesForRating: 0,
            tournament: {
                totalRounds: 1,
            },
        }, p1Id);
        tournamentEventId = tournamentEvent.id;
    });

    afterAll(() => {
        dbManager.db.prepare(
            'DELETE FROM automaticAchievementState WHERE userId IN (?, ?, ?, ?) OR sourceEventId IN (?, ?)'
        )
            .run(p1Id, p2Id, p3Id, p4Id, eventId, tournamentEventId);
        dbManager.db.prepare('DELETE FROM userRatingChange WHERE userId IN (?, ?, ?, ?) OR eventId IN (?, ?)')
            .run(p1Id, p2Id, p3Id, p4Id, eventId, tournamentEventId);
        dbManager.db.prepare('DELETE FROM skillRatingGame WHERE userId IN (?, ?, ?, ?)')
            .run(p1Id, p2Id, p3Id, p4Id);
        dbManager.db.prepare('DELETE FROM gameRound WHERE gameId IN (SELECT id FROM game WHERE eventId IN (?, ?))')
            .run(eventId, tournamentEventId);
        dbManager.db.prepare('DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId IN (?, ?))')
            .run(eventId, tournamentEventId);
        dbManager.db.prepare('DELETE FROM game WHERE eventId IN (?, ?)').run(eventId, tournamentEventId);
        dbManager.db.prepare('DELETE FROM eventAchievement WHERE eventId IN (?, ?)').run(eventId, tournamentEventId);
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId IN (?, ?)').run(eventId, tournamentEventId);
        dbManager.db.prepare('DELETE FROM tournament WHERE eventId = ?').run(tournamentEventId);
        dbManager.db.prepare('UPDATE club SET currentRatingEventId = NULL WHERE currentRatingEventId IN (?, ?)').run(
            eventId,
            tournamentEventId
        );
        dbManager.db.prepare('DELETE FROM event WHERE id IN (?, ?)').run(eventId, tournamentEventId);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM profile WHERE userId IN (?, ?, ?, ?)').run(p1Id, p2Id, p3Id, p4Id);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?, ?)').run(p1Id, p2Id, p3Id, p4Id);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    test('GET /api/achievements/catalog returns extended metadata and deterministic icon URLs', async () => {
        const response = await request(app)
            .get('/api/achievements/catalog')
            .set('Authorization', adminAuthHeader);

        expect(response.status).toBe(200);
        const { catalog } = response.body;
        expect(catalog.length).toBe(154);

        const g1 = catalog.find((c: any) => c.code === 'GAMES_1');
        expect(g1).toBeDefined();
        expect(g1.scopeType).toBe('GLOBAL');
        expect(g1.repeatable).toBe(false);
        expect(g1.trackedOnly).toBe(false);
        expect(g1.icon).toContain('https://firebasestorage.googleapis.com/v0/b/');
        expect(g1.icon).toContain('GAMES_1.webp');
    });

    test('POST /api/games direct submission calculates and returns achievementUnlocks', async () => {
        const response = await request(app)
            .post('/api/games')
            .set('Authorization', adminAuthHeader)
            .send({
                eventId,
                playersData: [
                    { userId: p1Id, points: 45000, startPlace: Wind.EAST },
                    { userId: p2Id, points: 35000, startPlace: Wind.SOUTH },
                    { userId: p3Id, points: 25000, startPlace: Wind.WEST },
                    { userId: p4Id, points: 15000, startPlace: Wind.NORTH },
                ],
            });

        if (response.status !== 201) {
            console.error('POST /api/games error:', response.body);
        }

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('achievementUnlocks');
        expect(Array.isArray(response.body.achievementUnlocks)).toBe(true);

        const p1Unlocks = response.body.achievementUnlocks.find((u: any) => u.user.id === p1Id);
        expect(p1Unlocks).toBeDefined();
        expect(p1Unlocks.achievements.some((a: any) => a.code === 'GAMES_1')).toBe(true);
        expect(p1Unlocks.achievements.some((a: any) => a.code === 'WINS_1')).toBe(true);
        expect(p1Unlocks.achievements[0]).toHaveProperty('category');
        expect(p1Unlocks.achievements[0]).toHaveProperty('scopeType');
    });

    test('GET /api/games/:id contains permanent achievementUnlocks', async () => {
        // Query the first game
        const listRes = await request(app)
            .get(`/api/games?eventId=${eventId}`)
            .set('Authorization', adminAuthHeader);

        const gameId = listRes.body[0].id;
        const response = await request(app)
            .get(`/api/games/${gameId}`)
            .set('Authorization', adminAuthHeader);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('achievementUnlocks');
        expect(response.body.achievementUnlocks.length).toBeGreaterThan(0);
    });

    test('POST /api/games/:id/finish returns achievementUnlocks', async () => {
        const createRes = await request(app)
            .post('/api/games/tracked')
            .set('Authorization', adminAuthHeader)
            .send({
                eventId,
                players: [
                    { userId: p1Id, startPlace: Wind.EAST },
                    { userId: p2Id, startPlace: Wind.SOUTH },
                    { userId: p3Id, startPlace: Wind.WEST },
                    { userId: p4Id, startPlace: Wind.NORTH },
                ],
                status: 'IN_PROGRESS',
            });

        const gameId = createRes.body.id;

        // Add a round with handDetail unlocking FIRST_PINFU
        const roundRes = await request(app)
            .post(`/api/games/${gameId}/rounds/1`)
            .set('Authorization', adminAuthHeader)
            .send({
                type: 'TSUMO',
                winningHandData: {
                    winnerPlayerId: p2Id,
                    han: 2,
                    fu: 20,
                    yakumanCount: 0,
                    handDetail: {
                        concealedTiles: [
                            'man_2',
                            'man_3',
                            'man_4',
                            'pin_3',
                            'pin_4',
                            'pin_5',
                            'sou_4',
                            'sou_5',
                            'sou_6',
                            'pin_8',
                            'pin_8',
                            'man_7',
                            'man_8',
                        ],
                        melds: [],
                        winningTile: 'man_9',
                        doraIndicators: [],
                        uraDoraIndicators: [],
                    },
                },
                riichiPlayerIds: [],
            });

        expect(roundRes.status).toBe(200);

        // Explicit finish
        const finishRes = await request(app)
            .post(`/api/games/${gameId}/finish`)
            .set('Authorization', adminAuthHeader);

        expect(finishRes.status).toBe(200);
        expect(finishRes.body).toHaveProperty('achievementUnlocks');
        const p2Unlocks = finishRes.body.achievementUnlocks.find((u: any) => u.user.id === p2Id);
        expect(p2Unlocks).toBeDefined();
        expect(p2Unlocks.achievements.some((a: any) => a.code === 'FIRST_PINFU')).toBe(true);
    });

    test('GET /api/events/:id/achievements returns lifetimeUnlocks for all event games', async () => {
        const response = await request(app)
            .get(`/api/events/${eventId}/achievements`)
            .set('Authorization', adminAuthHeader);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('achievements');
        expect(response.body).toHaveProperty('lifetimeUnlocks');
        expect(Array.isArray(response.body.lifetimeUnlocks)).toBe(true);
        expect(response.body.lifetimeUnlocks.length).toBeGreaterThan(0);

        const p2Lifetime = response.body.lifetimeUnlocks.find((u: any) => u.user.id === p2Id);
        expect(p2Lifetime).toBeDefined();
        expect(p2Lifetime.achievements.some((a: any) => a.code === 'FIRST_PINFU')).toBe(true);
    });

    test('POST /api/events/:id/tournament/finish calculates tournament champion lifetime achievements even with future dateTo', async () => {
        // Register players
        for (const uid of [p1Id, p2Id, p3Id, p4Id]) {
            const regRes = await request(app)
                .post(`/api/events/${tournamentEventId}/registrations/${uid}/manual`)
                .set('Authorization', adminAuthHeader)
                .send({
                    firstName: `Player${uid}`,
                    lastName: 'Tournament',
                });
            expect(regRes.status).toBe(200);
        }

        // Apply seating
        const applyRes = await request(app)
            .post(`/api/events/${tournamentEventId}/tournament/seating/apply`)
            .set('Authorization', adminAuthHeader)
            .send({
                rounds: [
                    [
                        [p1Id, p2Id, p3Id, p4Id],
                    ],
                ],
            });

        expect(applyRes.status).toBe(201);

        // Start round 1
        const startRoundRes = await request(app)
            .post(`/api/events/${tournamentEventId}/tournament/rounds/1/start`)
            .set('Authorization', adminAuthHeader);

        expect(startRoundRes.status).toBe(200);

        // Find game
        const tGamesRes = await request(app)
            .get(`/api/games?eventId=${tournamentEventId}`)
            .set('Authorization', adminAuthHeader);
        const tGameId = tGamesRes.body[0].id;

        // Start the game
        const startGameRes = await request(app)
            .post(`/api/games/${tGameId}/start`)
            .set('Authorization', adminAuthHeader);

        expect(startGameRes.status).toBe(200);

        // Add a round with handDetail unlocking FIRST_PINFU for p1Id
        const roundRes = await request(app)
            .post(`/api/games/${tGameId}/rounds/1`)
            .set('Authorization', adminAuthHeader)
            .send({
                type: 'TSUMO',
                winningHandData: {
                    winnerPlayerId: p1Id,
                    han: 2,
                    fu: 20,
                    yakumanCount: 0,
                    handDetail: {
                        concealedTiles: [
                            'man_2',
                            'man_3',
                            'man_4',
                            'pin_3',
                            'pin_4',
                            'pin_5',
                            'sou_4',
                            'sou_5',
                            'sou_6',
                            'pin_8',
                            'pin_8',
                            'man_7',
                            'man_8',
                        ],
                        melds: [],
                        winningTile: 'man_9',
                        doraIndicators: [],
                        uraDoraIndicators: [],
                    },
                },
                riichiPlayerIds: [],
            });

        expect(roundRes.status).toBe(200);

        // Finish game
        const finishGameRes = await request(app)
            .post(`/api/games/${tGameId}/finish`)
            .set('Authorization', adminAuthHeader);

        expect(finishGameRes.status).toBe(200);
        expect(finishGameRes.body).toHaveProperty('achievementUnlocks');

        // Finish tournament
        const finishTourRes = await request(app)
            .post(`/api/events/${tournamentEventId}/tournament/finish`)
            .set('Authorization', adminAuthHeader);

        expect(finishTourRes.status).toBe(200);

        // Check user achievements for p1 (should have TOURNAMENT_CHAMPION)
        const p1AchRes = await request(app)
            .get(`/api/users/${p1Id}/achievements`)
            .set('Authorization', adminAuthHeader);

        expect(p1AchRes.status).toBe(200);
        const champ = p1AchRes.body.achievements.find((a: any) => a.code === 'TOURNAMENT_CHAMPION');
        expect(champ).toBeDefined();
        expect(champ.type).toBe('AUTOMATIC');
        expect(champ.category).toBe('EVENT');
    });
});
