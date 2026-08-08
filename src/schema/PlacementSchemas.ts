import { z } from 'zod';
import { userIdParamSchema } from './UserSchemas.ts';

export const getUserPlacementsSchema = z.object({
    params: z.object({
        id: userIdParamSchema,
    }),
});
