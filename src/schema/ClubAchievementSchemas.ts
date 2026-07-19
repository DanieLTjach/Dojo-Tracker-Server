import z from 'zod';
import { clubIdParamSchema } from './CommonSchemas.ts';
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
export const clubAchievementIconSchema = z.string().trim().min(1, 'Icon cannot be empty').max(
    32,
    'Icon must be 32 characters or less'
).nullish();
export const clubAchievementNoteSchema = z.string().trim().max(500, 'Note must be 500 characters or less').nullish();

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
    }).refine(
        body => [body.builtInCode, body.definitionId, body.newDefinition].filter(v => v !== undefined).length === 1,
        { message: 'Provide exactly one of builtInCode, definitionId, or newDefinition' }
    ),
});

export const clubAchievementRevokeSchema = z.object({
    params: assignmentParamsSchema,
});
