import { z } from 'zod';
import { clubIdParamSchema } from './CommonSchemas.ts';

export const userNameSchema = z.string().trim().min(1, "Name cannot be empty");

export const telegramUsernameSchema = z.string()
    .startsWith('@', "Telegram username must start with '@'")
    .min(2, "Telegram username cannot be empty");

export const telegramIdParamSchema = z.coerce.number().int("Telegram ID must be an integer");
export const userIdSchema = z.number().int("User ID must be an integer");
export const userIdParamSchema = z.coerce.number().int("User ID must be an integer");

export const userRegistrationSchema = z.object({
    body: z.object({
        name: userNameSchema,
        telegramUsername: telegramUsernameSchema.nullish(),
        telegramId: telegramIdParamSchema
    })
});

export const getUserByIdSchema = z.object({
    params: z.object({
        id: userIdParamSchema
    })
});

export const getUserByTelegramIdSchema = z.object({
    params: z.object({
        telegramId: telegramIdParamSchema
    })
});

export const getUserListSchema = z.object({
    query: z.object({
        clubId: clubIdParamSchema.optional()
    }).optional()
});

export const userEditSchema = z.object({
    params: z.object({
        id: userIdParamSchema
    }),
    body: z.object({
        name: userNameSchema.nullish(),
        telegramUsername: telegramUsernameSchema.nullish()
    })
}).refine((data) => data.body.name || data.body.telegramUsername, {
    message: "At least one of 'name' or 'telegramUsername' must be provided"
});

export const userActivationSchema = z.object({
    params: z.object({
        id: userIdParamSchema
    })
});

export const userDeactivationSchema = userActivationSchema;
