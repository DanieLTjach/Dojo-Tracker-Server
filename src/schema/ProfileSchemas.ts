import { z } from 'zod';
import { localeSchema } from './CommonSchemas.ts';
import { userIdParamSchema } from './UserSchemas.ts';

export const profileEditSchema = z.object({
    params: z.object({
        id: userIdParamSchema,
    }),
    body: z.object({
        firstNameEn: z.string().trim().min(1).nullish(),
        lastNameEn: z.string().trim().min(1).nullish(),
        firstName: z.string().trim().min(1).nullish(),
        lastName: z.string().trim().min(1).nullish(),
        emaNumber: z.string().regex(/^\d+$/, 'EMA number must contain only digits').nullish(),
        locale: localeSchema.nullish(),
        hideProfile: z.boolean().optional(),
    }),
});
