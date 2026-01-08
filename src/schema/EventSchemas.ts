import z from 'zod';

export const eventIdSchema = z.number().int('Event ID must be an integer');
export const eventIdParamSchema = z.coerce.number().int('Event ID must be an integer');
