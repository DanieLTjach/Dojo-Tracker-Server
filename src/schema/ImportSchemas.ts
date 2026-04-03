import { z } from 'zod';

export const gameImportSchema = z.object({
    body: z.object({
        eventId: z.coerce.number().int('Event ID must be an integer')
    })
});
