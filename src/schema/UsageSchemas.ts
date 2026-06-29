import z from 'zod';
import { clubIdParamSchema } from './CommonSchemas.ts';

const usageDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const usageParamsSchema = z.object({
    clubId: clubIdParamSchema,
});

export const usageSummarySchema = z.object({
    params: usageParamsSchema,
    query: z.object({
        dateFrom: usageDateSchema.optional(),
        dateTo: usageDateSchema.optional(),
    }).optional(),
});

export const usageAdjustmentSchema = z.object({
    params: usageParamsSchema,
    body: z.object({
        creditsDelta: z.number().int().refine(value => value !== 0, 'creditsDelta must not be 0'),
        reason: z.string().trim().min(1).max(500),
        externalReference: z.string().trim().min(1).max(200).optional(),
    }),
});

export const usageAccountUpdateSchema = z.object({
    params: usageParamsSchema,
    body: z.object({
        overdraftCutoff: z.number().int(),
        reason: z.string().trim().min(1).max(500),
        externalReference: z.string().trim().min(1).max(200).optional(),
    }),
});
