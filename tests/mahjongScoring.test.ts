import {
    HandDetailContextConflictError,
    HandHasNoYakuError,
    HandDetailNotSupportedForSanmaError,
    InvalidHandDetailStructureError,
    NonWinningHandError,
    UnmappedYakuError,
    UnsupportedScoringContextError,
} from '../src/error/PointCalculationErrors.ts';
import { meldToMajiang } from '../src/mahjong/notation.ts';
import { scoreHand } from '../src/mahjong/scoreHand.ts';
import type { HandDetail, ScoreHandInput } from '../src/mahjong/types.ts';
import { mapJapaneseYakuToCode } from '../src/mahjong/yakuCodes.ts';
import type { GamePlayer } from '../src/model/GameModels.ts';
import { gameRoundResultWithoutPointsSchema } from '../src/schema/GameRoundResultSchemas.ts';
import { normalizeWinningHandDataWithHandDetail } from '../src/util/PointCalculationUtil.ts';

describe('Mahjong Hand Scoring Engine', () => {
    describe('Regression Guard: Chiitoitsu + Riichi + Tsumo', () => {
        it('derives 4 han / 25 fu and exact yaku list [riichi, menzen_tsumo, chiitoitsu]', () => {
            const handDetail: HandDetail = {
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
            };

            const input: ScoreHandInput = {
                handDetail,
                winType: 'TSUMO',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                riichiPlayerSeats: new Set([0]),
            };

            const result = scoreHand(input);
            expect(result.han).toBe(4);
            expect(result.fu).toBe(25);
            expect(result.yakumanCount).toBe(0);
            expect(result.yaku).toEqual([
                { code: 'riichi', han: 1 },
                { code: 'menzen_tsumo', han: 1 },
                { code: 'chiitoitsu', han: 2 },
            ]);
        });
    });

    describe('Pinnable Yaku Coverage', () => {
        it('scores Sanshoku Doujun', () => {
            // m123 p123 s123 m567 z11 (winning m7)
            const handDetail: HandDetail = {
                concealedTiles: [
                    'man_1',
                    'man_2',
                    'man_3',
                    'pin_1',
                    'pin_2',
                    'pin_3',
                    'sou_1',
                    'sou_2',
                    'sou_3',
                    'man_5',
                    'man_6',
                    'ton',
                    'ton',
                ],
                melds: [],
                winningTile: 'man_7',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            const result = scoreHand({
                handDetail,
                winType: 'TSUMO',
                winnerSeat: 1,
                dealerSeat: 0,
                roundWindSeat: 0,
            });

            expect(result.yaku.some(y => y.code === 'sanshoku_doujun')).toBe(true);
            expect(result.yaku.some(y => y.code === 'menzen_tsumo')).toBe(true);
        });

        it('scores Ittsuu', () => {
            // m123456789 p123 z11 (winning m9)
            const handDetail: HandDetail = {
                concealedTiles: [
                    'man_1',
                    'man_2',
                    'man_3',
                    'man_4',
                    'man_5',
                    'man_6',
                    'man_7',
                    'man_8',
                    'pin_1',
                    'pin_2',
                    'pin_3',
                    'ton',
                    'ton',
                ],
                melds: [],
                winningTile: 'man_9',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            const result = scoreHand({
                handDetail,
                winType: 'TSUMO',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
            });

            expect(result.yaku.some(y => y.code === 'ittsuu')).toBe(true);
        });

        it('scores Seat and Round winds', () => {
            // East seat, East round wind: ton pon -> seat & round wind, haku pon -> dragon
            const handDetail: HandDetail = {
                concealedTiles: ['man_1', 'man_2', 'man_3', 'pin_1', 'pin_2', 'pin_3', 'sou_1'],
                melds: [
                    { type: 'PON', tiles: ['ton', 'ton', 'ton'], calledTileIndex: 0, calledFrom: 'KAMICHA' },
                    { type: 'PON', tiles: ['haku', 'haku', 'haku'], calledTileIndex: 0, calledFrom: 'TOIMEN' },
                ],
                winningTile: 'sou_1',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            const result = scoreHand({
                handDetail,
                winType: 'RON',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                dealInSeat: 1,
            });

            expect(result.yaku.some(y => y.code === 'bakaze_ton')).toBe(true);
            expect(result.yaku.some(y => y.code === 'jikaze_ton')).toBe(true);
            expect(result.yaku.some(y => y.code === 'haku')).toBe(true);
        });

        it('scores Dora, Aka Dora, and Ura Dora correctly', () => {
            // concealed: m123 p123 s123 aka_man_5 man_6 (winning man_7) z11
            const handDetail: HandDetail = {
                concealedTiles: [
                    'man_1',
                    'man_2',
                    'man_3',
                    'pin_1',
                    'pin_2',
                    'pin_3',
                    'sou_1',
                    'sou_2',
                    'sou_3',
                    'aka_man_5',
                    'man_6',
                    'ton',
                    'ton',
                ],
                melds: [],
                winningTile: 'man_7',
                doraIndicators: ['man_4'], // Dora is man_5! (aka_man_5 + man_5 count as dora!)
                uraDoraIndicators: ['pin_9'], // Ura dora is pin_1
            };

            const result = scoreHand({
                handDetail,
                winType: 'TSUMO',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                riichiPlayerSeats: new Set([0]),
            });

            expect(result.yaku.some(y => y.code === 'aka_dora')).toBe(true);
            expect(result.yaku.some(y => y.code === 'dora')).toBe(true);
            expect(result.yaku.some(y => y.code === 'ura_dora')).toBe(true);
        });
    });

    describe('Yakuman and Pao', () => {
        it('scores Daisangen with Pao liability target', () => {
            // z555 z666 z777 m123 p11
            // 3rd dragon call (chun) was from SHIMOCHA (seat 1 relative to winner seat 0)
            const handDetail: HandDetail = {
                concealedTiles: ['man_1', 'man_2', 'man_3', 'pin_1'],
                melds: [
                    { type: 'PON', tiles: ['haku', 'haku', 'haku'], calledTileIndex: 0, calledFrom: 'KAMICHA' },
                    { type: 'PON', tiles: ['hatsu', 'hatsu', 'hatsu'], calledTileIndex: 0, calledFrom: 'TOIMEN' },
                    { type: 'PON', tiles: ['chun', 'chun', 'chun'], calledTileIndex: 0, calledFrom: 'SHIMOCHA' },
                ],
                winningTile: 'pin_1',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            const result = scoreHand({
                handDetail,
                winType: 'RON',
                winnerSeat: 0, // Winner seat 0
                dealerSeat: 0,
                roundWindSeat: 0,
                dealInSeat: 2, // Deal-in seat 2
                rules: { liability_payment: 'big_dragons_big_winds' },
            });

            expect(result.yakumanCount).toBe(1);
            expect(result.yaku).toEqual([{ code: 'daisangen', yakumanCount: 1 }]);
            expect(result.paoSeat).toBe(1); // Seat 1 called 3rd dragon (SHIMOCHA)
        });

        it('scores Double Yakuman (Daisuushi)', () => {
            // z111 z222 z333 z444 m11
            const handDetail: HandDetail = {
                concealedTiles: ['man_1'],
                melds: [
                    { type: 'PON', tiles: ['ton', 'ton', 'ton'], calledTileIndex: 0, calledFrom: 'KAMICHA' },
                    { type: 'PON', tiles: ['nan', 'nan', 'nan'], calledTileIndex: 0, calledFrom: 'TOIMEN' },
                    { type: 'PON', tiles: ['shaa', 'shaa', 'shaa'], calledTileIndex: 0, calledFrom: 'SHIMOCHA' },
                    { type: 'PON', tiles: ['pei', 'pei', 'pei'], calledTileIndex: 0, calledFrom: 'KAMICHA' },
                ],
                winningTile: 'man_1',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            const result = scoreHand({
                handDetail,
                winType: 'RON',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                dealInSeat: 1,
            });

            expect(result.yakumanCount).toBe(2);
            expect(result.yaku).toEqual([{ code: 'daisuushi', yakumanCount: 2 }]);
        });

        it('scores Counted Yakuman (kazoe yakuman)', () => {
            // Open Chinitsu (5) + Dora 8 = 13 han
            const handDetail: HandDetail = {
                concealedTiles: [
                    'man_1',
                    'man_1',
                    'man_1',
                    'man_2',
                    'man_3',
                    'man_4',
                    'man_8',
                    'man_8',
                    'man_8',
                    'man_9',
                ],
                melds: [{
                    type: 'CHII',
                    tiles: ['man_5', 'man_6', 'man_7'],
                    calledTileIndex: 0,
                    calledFrom: 'KAMICHA',
                }],
                winningTile: 'man_9',
                doraIndicators: ['man_7', 'man_7', 'man_7', 'man_8'],
                uraDoraIndicators: [],
            };

            const result = scoreHand({
                handDetail,
                winType: 'TSUMO',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
            });

            expect(result.han).toBe(16);
            expect(result.yakumanCount).toBe(1);
            expect(result.yaku.some(y => y.code === 'chinitsu')).toBe(true);
            expect(result.yaku.some(y => y.code === 'dora')).toBe(true);
        });
    });

    describe('Meld Types and Relative Directions', () => {
        it('handles CHII, PON, DAIMINKAN, and ANKAN in a scored hand', () => {
            const handDetail: HandDetail = {
                concealedTiles: ['man_9'],
                melds: [
                    { type: 'CHII', tiles: ['man_1', 'man_2', 'man_3'], calledTileIndex: 0, calledFrom: 'KAMICHA' },
                    { type: 'PON', tiles: ['pin_5', 'aka_pin_5', 'pin_5'], calledTileIndex: 1, calledFrom: 'TOIMEN' },
                    {
                        type: 'DAIMINKAN',
                        tiles: ['sou_2', 'sou_2', 'sou_2', 'sou_2'],
                        calledTileIndex: 2,
                        calledFrom: 'SHIMOCHA',
                    },
                    { type: 'ANKAN', tiles: ['ton', 'ton', 'ton', 'ton'] },
                ],
                winningTile: 'man_9',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            const result = scoreHand({
                handDetail,
                winType: 'RON',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                dealInSeat: 3, // KAMICHA
            });

            expect(result.han).toBeGreaterThan(0);
        });

        it('places the called red tile correctly in pon and kakan engine notation', () => {
            expect(meldToMajiang({
                type: 'PON',
                tiles: ['aka_pin_5', 'pin_5', 'pin_5'],
                calledTileIndex: 0,
                calledFrom: 'TOIMEN',
            })).toBe('p550=');
            expect(meldToMajiang({
                type: 'KAKAN',
                tiles: ['aka_pin_5', 'pin_5', 'pin_5', 'pin_5'],
                calledTileIndex: 0,
                calledFrom: 'TOIMEN',
            })).toBe('p550=5');
        });
    });

    describe('Rules and authoritative normalization', () => {
        it('maps the two-fu and four-fu double-wind rules in the correct direction', () => {
            const handDetail: HandDetail = {
                concealedTiles: [
                    'man_4',
                    'man_5',
                    'man_7',
                    'man_8',
                    'man_9',
                    'pin_1',
                    'pin_1',
                    'pin_1',
                    'ton',
                    'ton',
                ],
                melds: [{
                    type: 'CHII',
                    tiles: ['man_1', 'man_2', 'man_3'],
                    calledTileIndex: 0,
                    calledFrom: 'KAMICHA',
                }],
                winningTile: 'man_6',
                doraIndicators: [],
                uraDoraIndicators: [],
            };
            const baseInput = {
                handDetail,
                winType: 'RON' as const,
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                dealInSeat: 2,
            };

            expect(scoreHand({ ...baseInput, rules: { double_wind_fu: 'two_fu' } }).fu).toBe(30);
            expect(scoreHand({ ...baseInput, rules: { double_wind_fu: 'four_fu' } }).fu).toBe(40);
        });

        it('does not award indicator or ura dora when dora is disabled', () => {
            const handDetail: HandDetail = {
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
                doraIndicators: ['haku'],
                uraDoraIndicators: ['haku'],
            };

            const result = scoreHand({
                handDetail,
                winType: 'TSUMO',
                winnerSeat: 0,
                dealerSeat: 0,
                roundWindSeat: 0,
                riichiPlayerSeats: new Set([0]),
                rules: { dora: false },
            });

            expect(result.yaku.some(yaku => yaku.code === 'dora' || yaku.code === 'ura_dora')).toBe(false);
            expect(result.han).toBe(4);
        });

        it('derives seats from start places, independent of repository player order', () => {
            const makePlayer = (userId: number, startPlace: GamePlayer['startPlace']): GamePlayer => ({
                gameId: 1,
                userId,
                name: `Player ${userId}`,
                telegramUsername: null,
                profileFirstName: null,
                profileLastName: null,
                profileHidden: false,
                points: 25_000,
                ratingChange: 0,
                startPlace,
                chomboCount: 0,
                isSubstitutePlayer: false,
            });
            const players = [
                makePlayer(30, 'WEST'),
                makePlayer(10, 'EAST'),
                makePlayer(40, 'NORTH'),
                makePlayer(20, 'SOUTH'),
            ];
            const handDetail: HandDetail = {
                concealedTiles: [
                    'ton',
                    'ton',
                    'ton',
                    'nan',
                    'nan',
                    'nan',
                    'man_1',
                    'man_2',
                    'man_3',
                    'pin_1',
                    'pin_2',
                    'pin_3',
                    'haku',
                ],
                melds: [],
                winningTile: 'haku',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            const normalized = normalizeWinningHandDataWithHandDetail(
                { winnerPlayerId: 20, yakumanCount: 0, handDetail },
                'TSUMO',
                undefined,
                [],
                players,
                { wind: 'EAST', dealerNumber: 1, counters: 0, riichiSticks: 0 },
                { number_of_players: 4 },
                false
            );
            const yakuCodes = normalized.yaku?.map(yaku => yaku.code);

            expect(yakuCodes).toContain('bakaze_ton');
            expect(yakuCodes).toContain('jikaze_nan');
        });

        it('rejects client-supplied server-derived yaku', () => {
            const parsed = gameRoundResultWithoutPointsSchema.safeParse({
                type: 'TSUMO',
                riichiPlayerIds: [],
                winningHandData: {
                    winnerPlayerId: 1,
                    yakumanCount: 0,
                    han: 1,
                    fu: 30,
                    yaku: [{ code: 'riichi', han: 1 }],
                },
            });

            expect(parsed.success).toBe(false);
        });
    });

    describe('Validation and Error Rejections', () => {
        const baseHand: HandDetail = {
            concealedTiles: [
                'man_1',
                'man_1',
                'man_2',
                'man_2',
                'man_3',
                'man_3',
                'man_4',
                'man_4',
                'man_5',
                'man_5',
                'man_6',
                'man_6',
                'man_7',
            ],
            melds: [],
            winningTile: 'man_7',
            doraIndicators: [],
            uraDoraIndicators: [],
        };

        it('rejects 3-player game (Sanma)', () => {
            expect(() =>
                scoreHand({
                    handDetail: baseHand,
                    winType: 'TSUMO',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                    rules: { number_of_players: 3 },
                })
            ).toThrow(HandDetailNotSupportedForSanmaError);
        });

        it('rejects concealed tile count mismatch', () => {
            const badHand = { ...baseHand, concealedTiles: baseHand.concealedTiles.slice(0, 10) };
            expect(() =>
                scoreHand({
                    handDetail: badHand,
                    winType: 'TSUMO',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                })
            ).toThrow(InvalidHandDetailStructureError);
        });

        it('rejects 5th tile copy across hand and indicators', () => {
            // 4 man_1 in concealed, + 1 man_1 in doraIndicators = 5 copies!
            const badHand: HandDetail = {
                ...baseHand,
                concealedTiles: [
                    'man_1',
                    'man_1',
                    'man_1',
                    'man_1',
                    'man_2',
                    'man_2',
                    'man_3',
                    'man_3',
                    'man_4',
                    'man_4',
                    'man_5',
                    'man_5',
                    'man_6',
                ],
                winningTile: 'man_6',
                doraIndicators: ['man_1'],
            };

            expect(() =>
                scoreHand({
                    handDetail: badHand,
                    winType: 'TSUMO',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                })
            ).toThrow(InvalidHandDetailStructureError);
        });

        it('rejects illegal red five usage exceeding ruleset', () => {
            const badHand: HandDetail = {
                ...baseHand,
                concealedTiles: [
                    'aka_man_5',
                    'aka_man_5',
                    'man_2',
                    'man_2',
                    'man_3',
                    'man_3',
                    'man_4',
                    'man_4',
                    'man_5',
                    'man_5',
                    'man_6',
                    'man_6',
                    'man_7',
                ],
            };

            expect(() =>
                scoreHand({
                    handDetail: badHand,
                    winType: 'TSUMO',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                    rules: { red_fives: 'three_one_per_suit' },
                })
            ).toThrow(InvalidHandDetailStructureError);
        });

        it('rejects invalid CHII meld structure', () => {
            const badHand: HandDetail = {
                concealedTiles: [
                    'man_1',
                    'man_2',
                    'man_3',
                    'pin_1',
                    'pin_2',
                    'pin_3',
                    'sou_1',
                    'sou_2',
                    'sou_3',
                    'haku',
                ],
                // Non-consecutive numbers 1, 3, 5
                melds: [{
                    type: 'CHII',
                    tiles: ['man_1', 'man_3', 'man_5'],
                    calledTileIndex: 0,
                    calledFrom: 'KAMICHA',
                }],
                winningTile: 'haku',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            expect(() =>
                scoreHand({
                    handDetail: badHand,
                    winType: 'RON',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                    dealInSeat: 3,
                })
            ).toThrow(InvalidHandDetailStructureError);
        });

        it('rejects contradictory context flags (e.g. haitei on RON)', () => {
            const badHand: HandDetail = {
                ...baseHand,
                context: { haitei: true },
            };

            expect(() =>
                scoreHand({
                    handDetail: badHand,
                    winType: 'RON',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                    dealInSeat: 1,
                })
            ).toThrow(HandDetailContextConflictError);
        });

        it('rejects riichi on an open hand and rinshan without a kan', () => {
            const openHand: HandDetail = {
                concealedTiles: [
                    'man_4',
                    'man_5',
                    'man_6',
                    'man_7',
                    'man_8',
                    'man_9',
                    'pin_1',
                    'pin_1',
                    'pin_1',
                    'ton',
                ],
                melds: [{
                    type: 'CHII',
                    tiles: ['man_1', 'man_2', 'man_3'],
                    calledTileIndex: 0,
                    calledFrom: 'KAMICHA',
                }],
                winningTile: 'ton',
                doraIndicators: [],
                uraDoraIndicators: [],
            };
            expect(() =>
                scoreHand({
                    handDetail: openHand,
                    winType: 'RON',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                    dealInSeat: 2,
                    riichiPlayerSeats: new Set([0]),
                })
            ).toThrow(HandDetailContextConflictError);

            const rinshanWithoutKan: HandDetail = {
                ...openHand,
                context: { rinshanKaihou: true },
            };
            expect(() =>
                scoreHand({
                    handDetail: rinshanWithoutKan,
                    winType: 'TSUMO',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                })
            ).toThrow(HandDetailContextConflictError);
        });

        it('rejects stacked yakuman when pao covers only part of the hand value', () => {
            const partialPaoHand: HandDetail = {
                concealedTiles: ['ton', 'ton', 'ton', 'nan'],
                melds: [
                    { type: 'PON', tiles: ['haku', 'haku', 'haku'], calledTileIndex: 0, calledFrom: 'KAMICHA' },
                    { type: 'PON', tiles: ['hatsu', 'hatsu', 'hatsu'], calledTileIndex: 0, calledFrom: 'TOIMEN' },
                    { type: 'PON', tiles: ['chun', 'chun', 'chun'], calledTileIndex: 0, calledFrom: 'SHIMOCHA' },
                ],
                winningTile: 'nan',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            expect(() =>
                scoreHand({
                    handDetail: partialPaoHand,
                    winType: 'TSUMO',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                    rules: { liability_payment: 'big_dragons_big_winds', yakuman_stacking: true },
                })
            ).toThrow(UnsupportedScoringContextError);
        });

        it('rejects tenhou claimed by non-dealer', () => {
            const badHand: HandDetail = {
                ...baseHand,
                context: { tenhou: true },
            };

            expect(() =>
                scoreHand({
                    handDetail: badHand,
                    winType: 'TSUMO',
                    winnerSeat: 1, // Non-dealer
                    dealerSeat: 0,
                    roundWindSeat: 0,
                })
            ).toThrow(HandDetailContextConflictError);
        });

        it('rejects non-winning hand', () => {
            const badHand: HandDetail = {
                concealedTiles: [
                    'man_1',
                    'man_2',
                    'man_4',
                    'man_5',
                    'man_7',
                    'man_8',
                    'pin_1',
                    'pin_3',
                    'pin_5',
                    'sou_2',
                    'sou_4',
                    'sou_6',
                    'ton',
                ],
                melds: [],
                winningTile: 'nan',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            expect(() =>
                scoreHand({
                    handDetail: badHand,
                    winType: 'TSUMO',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                })
            ).toThrow(NonWinningHandError);
        });

        it('rejects winning hand with no yaku (Yaku Nashi)', () => {
            // Open tanyao hand when open_tanyao is false (no sanshoku: m234 p345 s456 s22 m678)
            const badHand: HandDetail = {
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
                    'sou_2',
                ],
                melds: [{
                    type: 'CHII',
                    tiles: ['man_6', 'man_7', 'man_8'],
                    calledTileIndex: 0,
                    calledFrom: 'KAMICHA',
                }],
                winningTile: 'sou_2',
                doraIndicators: [],
                uraDoraIndicators: [],
            };

            expect(() =>
                scoreHand({
                    handDetail: badHand,
                    winType: 'RON',
                    winnerSeat: 0,
                    dealerSeat: 0,
                    roundWindSeat: 0,
                    dealInSeat: 3,
                    rules: { open_tanyao: false },
                })
            ).toThrow(HandHasNoYakuError);
        });

        it('throws UnmappedYakuError for unknown yaku name', () => {
            expect(() => mapJapaneseYakuToCode('NonExistentYaku')).toThrow(UnmappedYakuError);
        });
    });
});
