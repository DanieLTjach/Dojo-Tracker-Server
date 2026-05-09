import z from 'zod';
import { eventIdParamSchema } from './EventSchemas.ts';
import { userIdParamSchema } from './UserSchemas.ts';
import { EventRegistrationStatus } from '../model/EventRegistrationModels.ts';

export const eventRegistrationStatusSchema = z.enum(Object.values(EventRegistrationStatus));

const eventParamsSchema = z.object({
    eventId: eventIdParamSchema
});

const eventUserParamsSchema = z.object({
    eventId: eventIdParamSchema,
    userId: userIdParamSchema
});

const statusFilterQuerySchema = z.object({
    status: eventRegistrationStatusSchema.optional()
}).optional();

export const eventRegistrationApplySchema = z.object({
    params: eventParamsSchema
});

export const eventRegistrationWithdrawSchema = z.object({
    params: eventParamsSchema
});

export const eventRegistrationListSchema = z.object({
    params: eventParamsSchema,
    query: statusFilterQuerySchema
});

export const eventRegistrationApproveSchema = z.object({
    params: eventUserParamsSchema
});

export const eventRegistrationRejectSchema = z.object({
    params: eventUserParamsSchema
});

export const eventRegistrationManualSchema = z.object({
    params: eventUserParamsSchema
});

export const eventRegistrationEditProfileSchema = z.object({
    params: eventUserParamsSchema,
    body: z.object({
        firstName: z.string().trim().min(1).nullish(),
        lastName: z.string().trim().min(1).nullish()
    }).refine(
        (data) => data.firstName !== undefined || data.lastName !== undefined,
        { message: 'At least one of firstName or lastName must be provided' }
    )
});

export const myRegistrationsSchema = z.object({
    query: statusFilterQuerySchema
});
