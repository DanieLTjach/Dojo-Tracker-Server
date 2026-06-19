import z from 'zod';
import { EventType, PlayerNameDisplay } from '../model/EventModels.ts';
import { dateSchema } from './CommonSchemas.ts';
import { clubIdParamSchema, clubIdSchema } from './ClubSchemas.ts';

export const eventIdSchema = z.number().int('Event ID must be an integer');
export const eventIdParamSchema = z.coerce.number().int('Event ID must be an integer');

export const eventGetByIdSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
    }),
});

const eventTypeEnum = z.enum(Object.values(EventType));
const eventDescriptionSchema = z.string().max(5000, 'Description must be 5000 characters or less');

const tournamentConfigSchema = z.strictObject({
    totalRounds: z.number().int('totalRounds must be an integer').positive('totalRounds must be positive'),
});

const playerNameDisplayEnum = z.enum(Object.values(PlayerNameDisplay));
const minParticipantsSchema = z.number().int('minParticipants must be an integer')
    .min(1, 'minParticipants must be at least 1');
const maxParticipantsSchema = z.number().int('maxParticipants must be an integer')
    .min(1, 'maxParticipants must be at least 1');
const registrationDeadlineSchema = dateSchema;

const eventConfigSchema = z.strictObject({
    playerNameDisplay: playerNameDisplayEnum.optional(),
    minParticipants: minParticipantsSchema.optional(),
    maxParticipants: maxParticipantsSchema.optional(),
    registrationDeadline: registrationDeadlineSchema.optional(),
});

const eventConfigPatchSchema = z.strictObject({
    playerNameDisplay: playerNameDisplayEnum.nullish(),
    minParticipants: minParticipantsSchema.nullish(),
    maxParticipants: maxParticipantsSchema.nullish(),
    registrationDeadline: registrationDeadlineSchema.nullish(),
});

const scheduleItemKindSchema = z.enum(['default', 'muted', 'milestone']);

const scheduleItemSchema = z.strictObject({
    time: z.string().trim().min(1, 'Schedule item time cannot be empty'),
    title: z.string().trim().min(1, 'Schedule item title cannot be empty'),
    kind: scheduleItemKindSchema.optional(),
});

const scheduleDaySchema = z.strictObject({
    date: dateSchema.transform(d => d.toISOString()).nullable(),
    title: z.string().trim().min(1, 'Schedule day title cannot be empty').optional(),
    items: z.array(scheduleItemSchema),
});

const venueSchema = z.strictObject({
    name: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    mapUrl: z.url('Venue mapUrl must be a valid URL').optional(),
    contactName: z.string().trim().min(1).optional(),
    contactTelegram: z.string().trim().min(1).optional(),
});

const contactsSchema = z.strictObject({
    phone: z.string().trim().min(1).optional(),
    email: z.email('contacts.email must be a valid email').optional(),
    telegram: z.string().trim().min(1).optional(),
    paymentInfo: z.string().trim().min(1)
        .max(1000, 'contacts.paymentInfo must be 1000 characters or less')
        .optional(),
});

const linksSchema = z.strictObject({
    site: z.url('links.site must be a valid URL').optional(),
    registrationForm: z.url('links.registrationForm must be a valid URL').optional(),
    googleMaps: z.url('links.googleMaps must be a valid URL').optional(),
});

const pairingsSchema = z.array(
    z.array(
        z.array(z.number().int('Pairing player id must be an integer'))
            .length(4, 'Each table must have exactly 4 players')
    )
).refine(
    rounds => {
        if (rounds.length === 0) return true;
        const firstTableCount = rounds[0]!.length;
        return rounds.every(r => r.length === firstTableCount);
    },
    { error: 'All rounds must have the same number of tables' }
);

export const eventInfoSchema = z.strictObject({
    schedule: z.array(scheduleDaySchema).optional(),
    venue: venueSchema.optional(),
    contacts: contactsSchema.optional(),
    links: linksSchema.optional(),
    pairings: pairingsSchema.optional(),
});

const eventSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
    description: eventDescriptionSchema.nullish(),
    type: eventTypeEnum,
    isCurrentRating: z.boolean().nullish(),
    dateFrom: dateSchema.nullish(),
    dateTo: dateSchema.nullish(),
    gameRulesId: z.number().int('gameRulesId must be an integer'),
    clubId: clubIdSchema.nullish(),
    startingRating: z.number().int('startingRating must be an integer').default(0),
    minimumGamesForRating: z.number().int('minimumGamesForRating must be an integer').min(0).default(0),
    blockGameCreation: z.boolean().default(false),
    info: eventInfoSchema.nullish(),
    config: eventConfigSchema.nullish(),
    tournament: tournamentConfigSchema.nullish(),
}).refine(
    data => {
        if (data.dateFrom && data.dateTo) {
            return data.dateFrom < data.dateTo;
        }
        return true;
    },
    { error: 'dateFrom must be before dateTo', path: ['dateTo'] }
).superRefine((data, ctx) => {
    if (data.type === EventType.TOURNAMENT && data.tournament === undefined) {
        ctx.addIssue({
            code: 'custom',
            message: 'Tournament config is required for TOURNAMENT events',
            path: ['tournament'],
        });
    }
    if (data.type !== EventType.TOURNAMENT && data.tournament !== undefined && data.tournament !== null) {
        ctx.addIssue({
            code: 'custom',
            message: 'Tournament config is only allowed for TOURNAMENT events',
            path: ['tournament'],
        });
    }

    const participantConfigFields = [
        ['minParticipants', data.config?.minParticipants],
        ['maxParticipants', data.config?.maxParticipants],
        ['registrationDeadline', data.config?.registrationDeadline],
    ] as const;
    if (data.type !== EventType.TOURNAMENT) {
        for (const [field, value] of participantConfigFields) {
            if (value === undefined) {
                continue;
            }
            ctx.addIssue({
                code: 'custom',
                message: `${field} is only allowed for TOURNAMENT events`,
                path: ['config', field],
            });
        }
    }

    const minParticipants = data.config?.minParticipants;
    const maxParticipants = data.config?.maxParticipants;
    if (minParticipants !== undefined && maxParticipants !== undefined && minParticipants > maxParticipants) {
        ctx.addIssue({
            code: 'custom',
            message: 'minParticipants must not exceed maxParticipants',
            path: ['config', 'minParticipants'],
        });
    }
});

export const eventCreateSchema = z.object({
    body: eventSchema,
});

export const eventUpdateSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
    }),
    body: eventSchema,
});

// Partial body for PATCH /api/events/:eventId. Every field is optional and
// carries NO default — an omitted key means "leave the existing value", which is
// the whole point of PATCH (the `.default()`s on the full schema would wrongly
// reset startingRating / minimumGamesForRating / blockGameCreation). The merged
// result is validated by the full `eventSchema` rules in the service, so the
// only job here is to type-check the fields that ARE present. `.strict()` keeps
// typos from silently no-op'ing.
export const eventPatchBodySchema = z.strictObject({
    name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').optional(),
    description: eventDescriptionSchema.nullish(),
    type: eventTypeEnum.optional(),
    isCurrentRating: z.boolean().nullish(),
    dateFrom: dateSchema.nullish(),
    dateTo: dateSchema.nullish(),
    gameRulesId: z.number().int('gameRulesId must be an integer').optional(),
    clubId: clubIdSchema.nullish(),
    startingRating: z.number().int('startingRating must be an integer').optional(),
    minimumGamesForRating: z.number().int('minimumGamesForRating must be an integer').min(0).optional(),
    blockGameCreation: z.boolean().optional(),
    info: eventInfoSchema.nullish(),
    config: eventConfigPatchSchema.nullish(),
    tournament: tournamentConfigSchema.nullish(),
});

export const eventPatchSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
    }),
    body: eventPatchBodySchema,
});

export type EventPatchBody = z.infer<typeof eventPatchBodySchema>;

export const eventDeleteSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
    }),
});

export const tournamentRoundStartSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
        roundId: z.coerce.number().int('Round ID must be an integer').positive('Round ID must be positive'),
    }),
});

export const tournamentSeatingGenerateSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
    }),
    body: z.strictObject({
        timeLimitMs: z.number().int('timeLimitMs must be an integer').min(100).max(30000).optional(),
        candidateCount: z.number().int('candidateCount must be an integer').min(1).max(5).optional(),
        seed: z.number().int('seed must be an integer').optional(),
    }).optional(),
});

const seatingApplyRoundsSchema = z.array(
    z.array(
        z.array(z.number().int('Seat user id must be an integer').positive())
            .length(4, 'Each table must have exactly 4 players')
    ).min(1, 'Each round must have at least one table')
).min(1, 'At least one round is required');

export const tournamentSeatingApplySchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
    }),
    body: z.strictObject({
        rounds: seatingApplyRoundsSchema,
    }),
});

export const tournamentSeatingClearSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
    }),
});

export const eventGetListSchema = z.object({
    query: z.object({
        clubId: clubIdParamSchema.optional(),
    }).optional(),
});

export const getEventAchievementsSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
    }),
});

export const recomputeEventAchievementsSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
    }),
});
