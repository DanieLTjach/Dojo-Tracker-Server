import { z } from 'zod';
import { userIdParamSchema } from './UserSchemas.ts';

export const publicAchievementSchema = z.object({
    params: z.object({
        userId: userIdParamSchema,
        code: z.string().trim().min(1, 'Achievement code cannot be empty'),
    }),
});
