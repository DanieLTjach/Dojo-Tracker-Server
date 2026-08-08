import { z } from 'zod';
import { clubIdParamSchema } from './CommonSchemas.ts';
import { userIdParamSchema } from './UserSchemas.ts';
import { DEFAULT_PROVISIONAL_GAME_THRESHOLD, PROVISIONAL_GAME_THRESHOLD_STEP } from '../model/SkillModels.ts';

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

/**
 * Ad-hoc leaderboard query. Everything is optional so the bare endpoint returns
 * a global all-tags board; the threshold is explicit rather than read from club
 * config because a filtered slice has far fewer games per player.
 */
export const getCustomSkillLeaderboardSchema = z.object({
    query: z.object({
        clubId: z.coerce.number().int().positive().optional(),
        gameSize: z.coerce.number().int().default(4),
        tags: z.string()
            .transform(v => v.split(',').map(t => t.trim()).filter(Boolean))
            .pipe(z.array(z.string()))
            .optional(),
        // Not z.coerce.boolean(): Boolean('false') is true, so ?matchAll=false
        // would silently select the AND-tag board.
        matchAll: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
        eventType: z.enum(['SEASON', 'TOURNAMENT']).optional(),
        threshold: z.coerce.number()
            .int()
            .min(1)
            .max(1000)
            .default(DEFAULT_PROVISIONAL_GAME_THRESHOLD),
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
    })
        // gameSize alone has no meaning here — it would silently fall through to
        // recomputing every club. Reject rather than ignore.
        .refine(q => q.gameSize === undefined || q.clubId !== undefined, {
            message: 'gameSize requires clubId',
            path: ['gameSize'],
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
