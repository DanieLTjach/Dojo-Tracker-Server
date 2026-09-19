import { z } from 'zod';

export const getNotificationsSchema = z.object({
    query: z.object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
    }).optional(),
});

export const markNotificationsReadSchema = z.object({
    body: z.object({
        notificationIds: z.array(z.coerce.number().int().positive()).optional(),
        all: z.boolean().optional(),
    }).optional(),
});
