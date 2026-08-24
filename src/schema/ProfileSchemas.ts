import { z } from 'zod';
import {
    boundedTextSchema,
    discordHandleSchema,
    gameAccountSchema,
    imageUrlSchema,
    localeSchema,
    tenhouIdSchema,
} from './CommonSchemas.ts';
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
        avatarUrl: imageUrlSchema.nullish(),
        statusLine: boundedTextSchema(140),
        birthDay: z.number().int().min(1).max(31).nullish(),
        birthMonth: z.number().int().min(1).max(12).nullish(),
        birthYear: z.number().int().min(1900).max(2100).nullish(),
        hideBirthYear: z.boolean().optional(),
        city: boundedTextSchema(100),
        favouriteYaku: boundedTextSchema(100),
        favouriteTile: boundedTextSchema(32),
        discord: discordHandleSchema.nullish(),
        majsoulAccount: gameAccountSchema.nullish(),
        tenhouAccount: tenhouIdSchema.nullish(),
    }),
});
