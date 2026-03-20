import z from 'zod';
import { clubMembershipStatuses, clubRoles } from '../model/ClubModels.ts';
import { userIdParamSchema } from './UserSchemas.ts';
import { optionalTextFieldSchema, clubIdParamSchema } from './CommonSchemas.ts';

export const clubIdSchema = z.number().int('Club ID must be an integer');
export { clubIdParamSchema };

export const clubRoleSchema = z.enum(clubRoles);
export const clubMembershipStatusSchema = z.enum(clubMembershipStatuses);

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

export const clubMembershipRequestJoinSchema = z.object({
    params: clubParamsSchema
});

export const clubMembershipLeaveSchema = z.object({
    params: clubParamsSchema
});

export const clubMembershipGetActiveMembersSchema = z.object({
    params: clubParamsSchema
});

export const clubMembershipGetStatusSchema = z.object({
    params: clubParamsSchema
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
