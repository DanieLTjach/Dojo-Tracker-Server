import { z } from 'zod';
import { gameIdParamSchema } from './GameSchemas.ts';

const smartCompassSessionIdParamSchema = z.coerce.number().int('Session ID must be an integer').positive();

const deviceLabelSchema = z.string().trim().min(1).max(64).nullish();

export const smartCompassPairingCodeCreationSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema,
    }),
});

export const smartCompassSessionRedemptionSchema = z.object({
    body: z.object({
        code: z.string().regex(/^\d{8}$/, 'Smart Compass code must contain exactly 8 digits'),
        deviceLabel: deviceLabelSchema,
    }),
});

export const smartCompassSessionListSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema,
    }),
});

export const smartCompassSessionRevocationSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema,
        sessionId: smartCompassSessionIdParamSchema,
    }),
});
