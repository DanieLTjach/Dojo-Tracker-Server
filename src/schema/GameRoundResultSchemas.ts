import { z } from 'zod';
import { userIdSchema } from './UserSchemas.ts';
import { AbortiveDrawType } from '../model/GameRoundResultModels.ts';

const winningHandDataSchema = z.object({
    winnerPlayerId: userIdSchema,
    yakumanCount: z.number().int().nonnegative(),
    yakumanLiabilityPlayerId: userIdSchema.optional(),
    han: z.number().int().min(1).max(100).optional(),
    fu: z.number().int().min(20).max(200).optional().refine(
        (fu) => fu === undefined || fu % 10 === 0 || fu === 25,
        { message: 'fu must a multiple of 10 or equal to 25' }
    )
});

const tsumoSchema = z.object({
    type: z.literal('TSUMO'),
    winningHandData: winningHandDataSchema,
    riichiPlayerIds: z.array(userIdSchema)
});

const ronSchema = z.object({
    type: z.literal('RON'),
    dealInPlayerId: userIdSchema,
    winningHandData: z.array(winningHandDataSchema).min(1).max(3).refine(
        (winningHandData) => {
            const uniquePlayerIds = new Set(winningHandData.map(hand => hand.winnerPlayerId));
            return uniquePlayerIds.size === winningHandData.length;
        },
        { message: 'Each winning player must be unique' }
    ),
    riichiPlayerIds: z.array(userIdSchema)
});

const exhaustiveDrawSchema = z.object({
    type: z.literal('EXHAUSTIVE_DRAW'),
    riichiPlayerIds: z.array(userIdSchema),
    tenpaiPlayerIds: z.array(userIdSchema),
    nagashiManganPlayerIds: z.array(userIdSchema)
});

const abortiveDrawSchema = z.object({
    type: z.literal('ABORTIVE_DRAW'),
    drawType: z.enum(Object.values(AbortiveDrawType))
});

const chomboSchema = z.object({
    type: z.literal('CHOMBO'),
    offenderPlayerId: userIdSchema
});

export const gameRoundResultWithoutPointsSchema = z.union([
    tsumoSchema,
    ronSchema,
    exhaustiveDrawSchema,
    abortiveDrawSchema,
    chomboSchema
]);
