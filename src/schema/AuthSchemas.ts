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
    body: z.discriminatedUnion('flow', [
        z.object({
            flow: z.literal('BROWSER'),
            code: z.string().trim().min(1, 'Discord code is required'),
            codeVerifier: z.string()
                .trim()
                .regex(/^[A-Za-z0-9._~-]{43,128}$/, 'Discord PKCE code verifier is invalid'),
        }),
        z.object({
            flow: z.literal('ACTIVITY'),
            code: z.string().trim().min(1, 'Discord code is required'),
        }),
    ]),
});

export const externalAuthRegistrationSchema = z.object({
    body: z.object({
        registrationToken: z.string().trim().min(1, 'Registration token is required'),
        name: authNameSchema,
    }),
});
