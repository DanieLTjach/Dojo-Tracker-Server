import { z } from 'zod';
import { uniqueUserIdsSchema, userIdSchema } from './UserSchemas.ts';
import { AbortiveDrawType } from '../model/GameRoundResultModels.ts';

const winningHandDataSchema = z.object({
    winnerPlayerId: userIdSchema,
    yakumanCount: z.number().int().min(0).max(6),
    yakumanLiabilityPlayerId: userIdSchema.optional(),
    han: z.number().int().min(1).max(100).optional(),
    fu: z.number().int().min(20).max(200).optional().refine(
        fu => fu === undefined || fu % 10 === 0 || fu === 25,
        { error: 'fu must a multiple of 10 or equal to 25' }
    ),
}).refine(
    winningHandData => winningHandData.yakumanLiabilityPlayerId !== winningHandData.winnerPlayerId,
    { error: 'Yakuman liability player cannot be the same as winner' }
);

const tsumoSchema = z.object({
    type: z.literal('TSUMO'),
    winningHandData: winningHandDataSchema,
    riichiPlayerIds: uniqueUserIdsSchema('riichi'),
});

const ronSchema = z.object({
    type: z.literal('RON'),
    dealInPlayerId: userIdSchema,
    winningHandData: z.array(winningHandDataSchema).min(1).max(3).refine(
        winningHandData => {
            const uniquePlayerIds = new Set(winningHandData.map(hand => hand.winnerPlayerId));
            return uniquePlayerIds.size === winningHandData.length;
        },
        { error: 'Each winning player must be unique' }
    ),
    riichiPlayerIds: uniqueUserIdsSchema('riichi'),
});

const exhaustiveDrawSchema = z.object({
    type: z.literal('EXHAUSTIVE_DRAW'),
    riichiPlayerIds: uniqueUserIdsSchema('riichi'),
    tenpaiPlayerIds: uniqueUserIdsSchema('tenpai'),
    nagashiManganPlayerIds: uniqueUserIdsSchema('nagashi mangan'),
});

const abortiveDrawSchema = z.object({
    type: z.literal('ABORTIVE_DRAW'),
    riichiPlayerIds: uniqueUserIdsSchema('riichi'),
    drawType: z.enum(Object.values(AbortiveDrawType)),
});

const chomboSchema = z.object({
    type: z.literal('CHOMBO'),
    offenderPlayerId: userIdSchema,
});

export const gameRoundResultWithoutPointsSchema = z.union([
    tsumoSchema,
    ronSchema,
    exhaustiveDrawSchema,
    abortiveDrawSchema,
    chomboSchema,
]);
