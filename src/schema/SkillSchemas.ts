import { z } from 'zod';
import { clubIdParamSchema } from './CommonSchemas.ts';
import { userIdParamSchema } from './UserSchemas.ts';
import { PROVISIONAL_GAME_THRESHOLD_STEP } from '../model/SkillModels.ts';

export const getUserSkillSchema = z.object({
    params: z.object({
        userId: userIdParamSchema,
    }),
});

export const getClubSkillLeaderboardSchema = z.object({
    params: z.object({
        clubId: clubIdParamSchema,
    }),
    query: z.object({
        gameSize: z.coerce.number().int().default(4),
    }),
});

export const recomputeClubSkillSchema = z.object({
    params: z.object({
        clubId: clubIdParamSchema,
    }),
    query: z.object({
        gameSize: z.coerce.number().int().optional(),
    }),
});

export const recomputeAdminSkillSchema = z.object({
    query: z.object({
        clubId: z.coerce.number().int().optional(),
        gameSize: z.coerce.number().int().optional(),
    }),
});

export const getClubSkillConfigSchema = z.object({
    params: z.object({
        clubId: clubIdParamSchema,
    }),
});

export const updateClubSkillConfigSchema = z.object({
    params: z.object({
        clubId: clubIdParamSchema,
    }),
    body: z.object({
        provisionalGameThreshold: z.number()
            .int()
            .min(PROVISIONAL_GAME_THRESHOLD_STEP)
            .multipleOf(PROVISIONAL_GAME_THRESHOLD_STEP)
            .optional(),
        isEnabled: z.boolean().optional(),
    }),
});
