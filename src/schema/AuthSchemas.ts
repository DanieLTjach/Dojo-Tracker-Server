import { z } from 'zod';

const authNameSchema = z.string().trim().min(1, 'Name cannot be empty').optional();

export const googleAuthSchema = z.object({
    body: z.object({
        credential: z.string().trim().min(1, 'Google credential is required'),
        name: authNameSchema,
    }),
});

export const telegramBrowserAuthSchema = z.object({
    body: z.object({
        idToken: z.string().trim().min(1, 'Telegram id_token is required'),
        name: authNameSchema,
    }),
});

export const discordAuthSchema = z.object({
    body: z.object({
        code: z.string().trim().min(1, 'Discord code is required'),
        name: authNameSchema,
    }),
});
