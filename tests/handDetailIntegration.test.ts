import express from 'express';
import request from 'supertest';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import clubRoutes from '../src/routes/ClubRoutes.ts';
import eventRoutes from '../src/routes/EventRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import gameRulesRoutes from '../src/routes/GameRulesRoutes.ts';
import { UserService } from '../src/service/UserService.ts';
import { createAuthHeader, resetTestDatabase } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api/clubs', clubRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/game-rules', gameRulesRoutes);
app.use(handleErrors);

describe('Hand Detail Integration Tests', () => {
    const adminAuthHeader = createAuthHeader(0);
    const userService = new UserService();
    const userRepository = new UserRepository();

    let player1Id: number;
    let player2Id: number;
    let player3Id: number;
    let player4Id: number;
    let player1AuthHeader: string;
    let clubId: number;
    let gameRulesId: number;
    let eventId: number;

    const createPlayer = (name: string, telegramId: number) => {
        const user = userService.registerUser(name, name.toLowerCase(), telegramId, 0);
        userRepository.updateUserStatus(user.id, true, 'ACTIVE', 0);
        return user.id;
    };

    const getGamePlayers = () => [
        { userId: player1Id, startPlace: 'EAST' as const },
        { userId: player2Id, startPlace: 'SOUTH' as const },
        { userId: player3Id, startPlace: 'WEST' as const },
        { userId: player4Id, startPlace: 'NORTH' as const },
    ];

    const createAndStartTrackedGame = async (targetEventId: number) => {
        const gameRes = await request(app)
            .post('/api/games/tracked')
            .set('Authorization', adminAuthHeader)
            .send({
                eventId: targetEventId,
                players: getGamePlayers(),
                status: 'IN_PROGRESS',
            });
        expect(gameRes.status).toBe(201);
        return gameRes.body.id as number;
    };

    beforeEach(async () => {
        resetTestDatabase();

        player1Id = createPlayer('Player1', 111111);
        player2Id = createPlayer('Player2', 222222);
        player3Id = createPlayer('Player3', 333333);
        player4Id = createPlayer('Player4', 444444);

        player1AuthHeader = createAuthHeader(player1Id);

        clubId = 1;
        gameRulesId = 1;

        // Create event
        const eventRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Hand Detail Test Event',
                type: 'SEASON',
                clubId,
                gameRulesId,
            });
        eventId = eventRes.body.id;
    });

    it('round posted with handDetail round-trips and derives yaku/han/fu', async () => {
        const gameId = await createAndStartTrackedGame(eventId);

        const roundPayload = {
            type: 'TSUMO',
            riichiPlayerIds: [player1Id],
            winningHandData: {
                winnerPlayerId: player1Id,
                yakumanCount: 0,
                handDetail: {
                    concealedTiles: [
                        'man_1',
                        'man_1',
                        'pin_2',
                        'pin_2',
                        'sou_3',
                        'sou_3',
                        'ton',
                        'ton',
                        'nan',
                        'nan',
                        'haku',
                        'haku',
                        'hatsu',
                    ],
                    melds: [],
                    winningTile: 'hatsu',
                    doraIndicators: [],
                    uraDoraIndicators: [],
                },
            },
        };

        // Preview
        const previewRes = await request(app)
            .post(`/api/games/${gameId}/rounds/1/preview`)
            .set('Authorization', player1AuthHeader)
            .send(roundPayload);

        expect(previewRes.status).toBe(200);
        expect(previewRes.body.winningHandData.han).toBe(4);
        expect(previewRes.body.winningHandData.fu).toBe(25);
        expect(previewRes.body.winningHandData.yaku).toHaveLength(3);

        // Submit
        const postRes = await request(app)
            .post(`/api/games/${gameId}/rounds/1`)
            .set('Authorization', player1AuthHeader)
            .send(roundPayload);

        expect(postRes.status).toBe(200);

        // Fetch detailed game and verify round JSON
        const getGameRes = await request(app)
            .get(`/api/games/${gameId}`)
            .set('Authorization', player1AuthHeader);

        const savedRound = getGameRes.body.rounds[0];
        expect(savedRound.result.winningHandData.han).toBe(4);
        expect(savedRound.result.winningHandData.fu).toBe(25);
        expect(savedRound.result.winningHandData.handDetail).toBeDefined();
        expect(savedRound.result.winningHandData.yaku).toHaveLength(3);
    });

    it('round posted without handDetail behaves untouched', async () => {
        const gameId = await createAndStartTrackedGame(eventId);

        const manualPayload = {
            type: 'TSUMO',
            riichiPlayerIds: [player1Id],
            winningHandData: {
                winnerPlayerId: player1Id,
                yakumanCount: 0,
                han: 1,
                fu: 30,
            },
        };

        const postRes = await request(app)
            .post(`/api/games/${gameId}/rounds/1`)
            .set('Authorization', player1AuthHeader)
            .send(manualPayload);

        expect(postRes.status).toBe(200);

        const getGameRes = await request(app)
            .get(`/api/games/${gameId}`)
            .set('Authorization', player1AuthHeader);

        const savedRound = getGameRes.body.rounds[0];
        expect(savedRound.result.winningHandData.han).toBe(1);
        expect(savedRound.result.winningHandData.fu).toBe(30);
        expect(savedRound.result.winningHandData.handDetail).toBeUndefined();
        expect(savedRound.result.winningHandData.yaku).toBeUndefined();
    });

    it('rejects client han/fu mismatch against derived hand detail', async () => {
        const gameId = await createAndStartTrackedGame(eventId);

        const mismatchPayload = {
            type: 'TSUMO',
            riichiPlayerIds: [player1Id],
            winningHandData: {
                winnerPlayerId: player1Id,
                yakumanCount: 0,
                han: 1, // Actual is 4 han for Chiitoitsu + Riichi + Tsumo!
                fu: 30,
                handDetail: {
                    concealedTiles: [
                        'man_1',
                        'man_1',
                        'pin_2',
                        'pin_2',
                        'sou_3',
                        'sou_3',
                        'ton',
                        'ton',
                        'nan',
                        'nan',
                        'haku',
                        'haku',
                        'hatsu',
                    ],
                    melds: [],
                    winningTile: 'hatsu',
                    doraIndicators: [],
                    uraDoraIndicators: [],
                },
            },
        };

        const postRes = await request(app)
            .post(`/api/games/${gameId}/rounds/1`)
            .set('Authorization', player1AuthHeader)
            .send(mismatchPayload);

        expect(postRes.status).toBe(400);
        expect(postRes.body.errorCode).toBe('handDetailScoreMismatch');
    });

    it('enforces requireHandDetail on event when set to true', async () => {
        // Patch event to require hand detail
        const patchRes = await request(app)
            .patch(`/api/events/${eventId}`)
            .set('Authorization', adminAuthHeader)
            .send({
                config: {
                    requireHandDetail: true,
                },
            });
        expect(patchRes.status).toBe(200);
        expect(patchRes.body.config.requireHandDetail).toBe(true);

        const gameId = await createAndStartTrackedGame(eventId);

        // Try submitting manual round without handDetail
        const manualPayload = {
            type: 'TSUMO',
            riichiPlayerIds: [],
            winningHandData: {
                winnerPlayerId: player1Id,
                yakumanCount: 0,
                han: 1,
                fu: 30,
            },
        };

        const rejectRes = await request(app)
            .post(`/api/games/${gameId}/rounds/1`)
            .set('Authorization', player1AuthHeader)
            .send(manualPayload);

        expect(rejectRes.status).toBe(400);
        expect(rejectRes.body.errorCode).toBe('handDetailRequired');
    });

    it('allows requireHandDetail: true on 3-player (sanma) ruleset', async () => {
        // Create 3-player game rules
        const sanmaRulesRes = await request(app)
            .post('/api/game-rules')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Sanma Rules',
                numberOfPlayers: 3,
                startingPoints: 35000,
                uma: [20, 0, -20],
                umaTieBreak: 'WIND',
                clubId: 1,
                allowNonZeroSumUma: false,
                details: {
                    rules: {
                        number_of_players: 3,
                        starting_points: 35000,
                    },
                },
            });
        expect(sanmaRulesRes.status).toBe(201);
        const sanmaRulesId = sanmaRulesRes.body.id;

        // Creating event with sanma rules and requireHandDetail: true
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Sanma Event',
                type: 'SEASON',
                clubId,
                gameRulesId: sanmaRulesId,
                config: {
                    requireHandDetail: true,
                },
            });

        expect(createRes.status).toBe(201);
        expect(createRes.body.config.requireHandDetail).toBe(true);

        const sanmaEventId = createRes.body.id;

        // Create and start tracked 3-player game
        const gameRes = await request(app)
            .post('/api/games/tracked')
            .set('Authorization', adminAuthHeader)
            .send({
                eventId: sanmaEventId,
                players: [
                    { userId: player1Id, startPlace: 'EAST' },
                    { userId: player2Id, startPlace: 'SOUTH' },
                    { userId: player3Id, startPlace: 'WEST' },
                ],
                status: 'IN_PROGRESS',
            });
        expect(gameRes.status).toBe(201);
        const gameId = gameRes.body.id;

        // Post a sanma round with kitaCount
        const roundPayload = {
            type: 'TSUMO',
            riichiPlayerIds: [],
            winningHandData: {
                winnerPlayerId: player1Id,
                yakumanCount: 0,
                handDetail: {
                    concealedTiles: [
                        'pin_1',
                        'pin_2',
                        'pin_3',
                        'pin_4',
                        'pin_5',
                        'pin_6',
                        'sou_1',
                        'sou_2',
                        'sou_3',
                        'ton',
                        'ton',
                        'nan',
                        'nan',
                    ],
                    melds: [],
                    winningTile: 'nan',
                    doraIndicators: [],
                    uraDoraIndicators: [],
                    kitaCount: 1,
                },
            },
        };

        const postRes = await request(app)
            .post(`/api/games/${gameId}/rounds/1`)
            .set('Authorization', player1AuthHeader)
            .send(roundPayload);

        expect(postRes.status).toBe(200);

        const getGameRes = await request(app)
            .get(`/api/games/${gameId}`)
            .set('Authorization', player1AuthHeader);

        const savedRound = getGameRes.body.rounds[0];
        expect(savedRound.result.winningHandData.handDetail.kitaCount).toBe(1);
        expect(savedRound.result.winningHandData.yaku.some((y: any) => y.code === 'kita')).toBe(true);
    });

    it('round posted with Renhou handDetail derives Mangan points under default rules', async () => {
        const gameId = await createAndStartTrackedGame(eventId);

        const roundPayload = {
            type: 'RON',
            dealInPlayerId: player3Id,
            riichiPlayerIds: [],
            winningHandData: [{
                winnerPlayerId: player2Id,
                yakumanCount: 0,
                handDetail: {
                    concealedTiles: [
                        'man_1',
                        'man_2',
                        'man_3',
                        'pin_2',
                        'pin_3',
                        'pin_4',
                        'sou_3',
                        'sou_4',
                        'sou_5',
                        'man_6',
                        'man_7',
                        'ton',
                        'ton',
                    ],
                    melds: [],
                    winningTile: 'man_8',
                    doraIndicators: [],
                    uraDoraIndicators: [],
                    context: { renhou: true },
                },
            }],
        };

        const postRes = await request(app)
            .post(`/api/games/${gameId}/rounds/1`)
            .set('Authorization', player1AuthHeader)
            .send(roundPayload);

        expect(postRes.status).toBe(200);

        const getGameRes = await request(app)
            .get(`/api/games/${gameId}`)
            .set('Authorization', player1AuthHeader);

        const savedRound = getGameRes.body.rounds[0];
        expect(savedRound.result.winningHandData[0].han).toBe(5);
        expect(savedRound.result.winningHandData[0].yaku).toEqual([{ code: 'renhou', han: 5 }]);
        // Non-dealer Mangan Ron is 8000 points from deal-in player
        const changes = savedRound.result.playerPointChanges;
        expect(changes.find((c: any) => c.playerId === player2Id)?.pointChange).toBe(8000);
        expect(changes.find((c: any) => c.playerId === player3Id)?.pointChange).toBe(-8000);
    });
});
