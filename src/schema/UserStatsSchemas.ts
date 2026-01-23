import z from 'zod';
import { eventIdParamSchema } from './EventSchemas.ts';
import { userIdParamSchema } from './UserSchemas.ts';

export const getUserEventStatsSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
        userId: userIdParamSchema,
    }),
});
