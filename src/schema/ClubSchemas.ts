import z from 'zod';
import { clubMembershipStatuses, clubRoles } from '../model/ClubModels.ts';
import { userIdParamSchema, userIdSchema } from './UserSchemas.ts';

export const clubIdSchema = z.number().int('Club ID must be an integer');
export const clubIdParamSchema = z.coerce.number().int('Club ID must be an integer');

export const clubRoleSchema = z.enum(clubRoles);
export const clubMembershipStatusSchema = z.enum(clubMembershipStatuses);

const optionalTextFieldSchema = z.string().trim().min(1, 'Field cannot be empty').nullish();

const clubBodySchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
    address: optionalTextFieldSchema,
    city: optionalTextFieldSchema,
    description: optionalTextFieldSchema,
    contactInfo: optionalTextFieldSchema,
    isActive: z.boolean().nullish(),
    ratingChatId: optionalTextFieldSchema,
    ratingTopicId: optionalTextFieldSchema
});

const clubParamsSchema = z.object({
    clubId: clubIdParamSchema
});

const clubMembershipParamsSchema = z.object({
    clubId: clubIdParamSchema,
    userId: userIdParamSchema
});

export const clubGetListSchema = z.object({
    query: z.object({}).optional()
});

export const clubGetByIdSchema = z.object({
    params: clubParamsSchema
});

export const clubCreateSchema = z.object({
    body: clubBodySchema
});

export const clubUpdateSchema = z.object({
    params: clubParamsSchema,
    body: clubBodySchema
});

export const clubDeleteSchema = z.object({
    params: clubParamsSchema
});

export const clubMembershipGetListSchema = z.object({
    params: clubParamsSchema
});

export const clubMembershipGetPendingListSchema = z.object({
    params: clubParamsSchema
});

export const clubMembershipCreateSchema = z.object({
    params: clubParamsSchema,
    body: z.object({
        userId: userIdSchema,
        role: clubRoleSchema.nullish()
    })
});

export const clubMembershipActivateSchema = z.object({
    params: clubMembershipParamsSchema
});

export const clubMembershipDeactivateSchema = z.object({
    params: clubMembershipParamsSchema
});

export const clubMembershipUpdateSchema = z.object({
    params: clubMembershipParamsSchema,
    body: z.object({
        role: clubRoleSchema
    })
});
