import { z } from 'zod';
import { clubIdParamSchema } from './CommonSchemas.ts';
import { userIdParamSchema } from './UserSchemas.ts';

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
        provisionalGameThreshold: z.number().int().min(1).optional(),
        isEnabled: z.boolean().optional(),
    }),
});
