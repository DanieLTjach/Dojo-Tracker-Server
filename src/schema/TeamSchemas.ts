import z from 'zod';
import { eventIdParamSchema } from './EventSchemas.ts';

const teamIdParamSchema = z.coerce.number().int('Team ID must be an integer').positive();
const userIdParamSchema = z.coerce.number().int('User ID must be an integer').positive();
const teamNameSchema = z.string().trim().min(1, 'Team name is required').max(
    100,
    'Team name must be 100 characters or less'
);

export const teamListSchema = z.object({
    params: z.object({ eventId: eventIdParamSchema }),
});

export const teamGetSchema = z.object({
    params: z.object({ eventId: eventIdParamSchema, teamId: teamIdParamSchema }),
});

export const teamAvailablePlayersSchema = z.object({
    params: z.object({ eventId: eventIdParamSchema }),
});

export const teamCreateSchema = z.object({
    params: z.object({ eventId: eventIdParamSchema }),
    body: z.strictObject({
        name: teamNameSchema,
        // Optional: managers can create a team for another captain; when omitted the
        // acting user becomes the captain.
        captainUserId: z.number().int('captainUserId must be an integer').positive().optional(),
    }),
});

export const teamRenameSchema = z.object({
    params: z.object({ eventId: eventIdParamSchema, teamId: teamIdParamSchema }),
    body: z.strictObject({ name: teamNameSchema }),
});

export const teamDeleteSchema = z.object({
    params: z.object({ eventId: eventIdParamSchema, teamId: teamIdParamSchema }),
});

export const teamAddMemberSchema = z.object({
    params: z.object({ eventId: eventIdParamSchema, teamId: teamIdParamSchema }),
    body: z.strictObject({ userId: z.number().int('userId must be an integer').positive() }),
});

export const teamRemoveMemberSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
        teamId: teamIdParamSchema,
        userId: userIdParamSchema,
    }),
});

export const startDraftSchema = z.object({
    params: z.object({ eventId: eventIdParamSchema }),
});

export const teamStandingsSchema = z.object({
    params: z.object({ eventId: eventIdParamSchema }),
});
