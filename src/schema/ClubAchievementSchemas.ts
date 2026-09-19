import z from 'zod';
import { clubIdParamSchema, imageUrlSchema } from './CommonSchemas.ts';
import { userIdParamSchema } from './UserSchemas.ts';

const clubParamsSchema = z.object({
    clubId: clubIdParamSchema,
});

const definitionParamsSchema = z.object({
    clubId: clubIdParamSchema,
    definitionId: z.coerce.number().int('Achievement definition ID must be an integer'),
});

const memberParamsSchema = z.object({
    clubId: clubIdParamSchema,
    userId: userIdParamSchema,
});

const assignmentParamsSchema = z.object({
    clubId: clubIdParamSchema,
    userId: userIdParamSchema,
    assignmentId: z.coerce.number().int('Assignment ID must be an integer'),
});

export const clubAchievementNameSchema = z.string().trim().min(1, 'Name is required').max(
    80,
    'Name must be 80 characters or less'
);
export const clubAchievementDescriptionSchema = z.string().trim().min(1, 'Description is required').max(
    500,
    'Description must be 500 characters or less'
);
export const clubAchievementIconSchema = imageUrlSchema.nullish();
export const clubAchievementNoteSchema = z.string().trim().max(500, 'Note must be 500 characters or less').nullish();

// An award often records something that happened earlier (a tournament, a season).
// Optional: omitted means "now". The future is refused because an award cannot be
// earned before it happens, and a stray future date would sort above everything.
export const clubAchievementAwardedAtSchema = z.coerce.date()
    .refine(value => value.getTime() <= Date.now(), 'Awarded date cannot be in the future')
    .optional();

export const recomputeAutomaticAchievementsSchema = z.object({
    body: z.object({
        userId: z.coerce.number().int().positive().optional(),
        clubId: z.coerce.number().int().positive().optional(),
    }).optional(),
});

export const clubAchievementCatalogListSchema = z.object({
    params: clubParamsSchema,
});

export const clubAchievementCatalogCreateSchema = z.object({
    params: clubParamsSchema,
    body: z.object({
        name: clubAchievementNameSchema,
        description: clubAchievementDescriptionSchema,
        icon: clubAchievementIconSchema,
    }),
});

export const clubAchievementCatalogArchiveSchema = z.object({
    params: definitionParamsSchema,
    body: z.object({
        archived: z.boolean(),
    }),
});

const newDefinitionBodySchema = z.object({
    name: clubAchievementNameSchema,
    description: clubAchievementDescriptionSchema,
    icon: clubAchievementIconSchema,
});

export const clubAchievementAssignSchema = z.object({
    params: memberParamsSchema,
    body: z.object({
        builtInCode: z.string().trim().min(1).optional(),
        definitionId: z.coerce.number().int().optional(),
        newDefinition: newDefinitionBodySchema.optional(),
        note: clubAchievementNoteSchema,
        awardedAt: clubAchievementAwardedAtSchema,
    }).refine(
        body => [body.builtInCode, body.definitionId, body.newDefinition].filter(v => v !== undefined).length === 1,
        { message: 'Provide exactly one of builtInCode, definitionId, or newDefinition' }
    ),
});

export const clubAchievementRevokeSchema = z.object({
    params: assignmentParamsSchema,
});
