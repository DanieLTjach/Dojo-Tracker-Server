import { z } from 'zod';

const telegramUsernameSchema = z.string()
    .startsWith('@', "Telegram username must start with '@'")
    .min(2, "Telegram username cannot be empty");

export const userRegistrationSchema = z.object({
    body: z.object({
        name: z.string().min(1, "Name cannot be empty"),
        telegramUsername: telegramUsernameSchema,
        telegramId: z.coerce.number(),
        createdBy: z.number().optional()
    })
});

export const userGetSchema = z.object({
    params: z.object({
        telegramId: z.coerce.number()
    })
});

export const userEditSchema = z.object({
    params: z.object({
        telegramId: z.coerce.number()
    }),
    body: z.object({
        name: z.string().min(1, "Name cannot be empty").optional(),
        telegramUsername: telegramUsernameSchema.optional(),
        modifiedBy: z.number()
    })
}).refine((data) => data.body.name || data.body.telegramUsername, {
    message: "At least one of 'name' or 'telegramUsername' must be provided"
});

export const userActivationSchema = z.object({
    params: z.object({
        telegramId: z.coerce.number()
    }),
    body: z.object({
        modifiedBy: z.number()
    })
});

export const userDeactivationSchema = userActivationSchema;