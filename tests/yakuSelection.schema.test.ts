import { describe, expect, it } from '@jest/globals';
import { gameRoundResultWithoutPointsSchema, yakuSelectionSchema } from '../src/schema/GameRoundResultSchemas.ts';

const ron = (winningHandData: Record<string, unknown>) => ({
    type: 'RON',
    dealInPlayerId: 2,
    riichiPlayerIds: [],
    winningHandData: [{ winnerPlayerId: 1, yakumanCount: 0, ...winningHandData }],
});

describe('yakuSelectionSchema', () => {
    it('accepts codes with dora counts and an open flag', () => {
        const result = yakuSelectionSchema.safeParse({
            codes: ['tanyao', 'pinfu', 'dora'],
            dora: 3,
            isOpen: false,
        });
        expect(result.success).toBe(true);
    });

    it('accepts a bare code list', () => {
        expect(yakuSelectionSchema.safeParse({ codes: ['tanyao'] }).success).toBe(true);
    });

    it('rejects an empty code list', () => {
        expect(yakuSelectionSchema.safeParse({ codes: [] }).success).toBe(false);
    });

    it('rejects duplicate codes', () => {
        expect(yakuSelectionSchema.safeParse({ codes: ['tanyao', 'tanyao'] }).success).toBe(false);
    });

    it('rejects an unknown code', () => {
        expect(yakuSelectionSchema.safeParse({ codes: ['not_a_yaku'] }).success).toBe(false);
    });

    it('rejects a negative dora count and an out-of-range fu', () => {
        expect(yakuSelectionSchema.safeParse({ codes: ['tanyao'], dora: -1 }).success).toBe(false);
        expect(yakuSelectionSchema.safeParse({ codes: ['tanyao'], fu: 33 }).success).toBe(false);
        expect(yakuSelectionSchema.safeParse({ codes: ['tanyao'], fu: 25 }).success).toBe(true);
    });
});

describe('winningHandData with yakuSelection', () => {
    it('accepts a round carrying a yaku selection', () => {
        const result = gameRoundResultWithoutPointsSchema.safeParse(
            ron({ yakuSelection: { codes: ['tanyao', 'pinfu'] } })
        );
        expect(result.success).toBe(true);
    });

    it('still accepts a round carrying hand detail alone', () => {
        const result = gameRoundResultWithoutPointsSchema.safeParse(
            ron({
                handDetail: {
                    concealedTiles: ['man_1'],
                    melds: [],
                    winningTile: 'man_1',
                    doraIndicators: [],
                    uraDoraIndicators: [],
                },
            })
        );
        expect(result.success).toBe(true);
    });

    // Two sources of truth for one hand: which one scored it would come down to
    // call order, so the pair is refused at the edge.
    it('rejects a round carrying both hand detail and a yaku selection', () => {
        const result = gameRoundResultWithoutPointsSchema.safeParse(
            ron({
                yakuSelection: { codes: ['tanyao'] },
                handDetail: {
                    concealedTiles: ['man_1'],
                    melds: [],
                    winningTile: 'man_1',
                    doraIndicators: [],
                    uraDoraIndicators: [],
                },
            })
        );
        expect(result.success).toBe(false);
    });

    it('still refuses a client-supplied yaku list', () => {
        const result = gameRoundResultWithoutPointsSchema.safeParse(
            ron({ yakuSelection: { codes: ['tanyao'] }, yaku: [{ code: 'tanyao', han: 1 }] })
        );
        expect(result.success).toBe(false);
    });
});
