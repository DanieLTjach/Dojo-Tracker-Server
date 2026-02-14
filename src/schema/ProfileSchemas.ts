import { z } from 'zod';
import { userIdParamSchema } from './UserSchemas.ts';

export const profileParamsSchema = z.object({
    params: z.object({
        id: userIdParamSchema
    })
});

export const profileEditSchema = z.object({
    params: z.object({
        id: userIdParamSchema
    }),
    body: z.object({
        firstNameEn: z.string().trim().min(1).nullish(),
        lastNameEn: z.string().trim().min(1).nullish(),
        emaNumber: z.string().regex(/^\d+$/, "EMA number must contain only digits").nullish(),
        hideProfile: z.boolean().optional()
    })
});
