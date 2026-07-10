import { z } from 'zod';

const authNameSchema = z.string().trim().min(1, 'Name cannot be empty');

export const googleAuthSchema = z.object({
    body: z.object({
        credential: z.string().trim().min(1, 'Google credential is required'),
    }),
});

export const telegramBrowserAuthSchema = z.object({
    body: z.object({
        idToken: z.string().trim().min(1, 'Telegram id_token is required'),
    }),
});

export const discordAuthSchema = z.object({
    body: z.object({
        code: z.string().trim().min(1, 'Discord code is required'),
    }),
});

export const externalAuthRegistrationSchema = z.object({
    body: z.object({
        registrationToken: z.string().trim().min(1, 'Registration token is required'),
        name: authNameSchema,
    }),
});
