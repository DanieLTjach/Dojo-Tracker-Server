import z from "zod";
import { dateSchema } from './CommonSchemas.ts';
import { clubIdParamSchema, clubIdSchema } from './ClubSchemas.ts';

export const eventIdSchema = z.number().int("Event ID must be an integer");
export const eventIdParamSchema = z.coerce.number().int("Event ID must be an integer");

export const eventGetByIdSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema
    })
});

const eventTypeEnum = z.enum(["SEASON", "TOURNAMENT"]);

const scheduleItemKindSchema = z.enum(['default', 'muted', 'milestone']);

const scheduleItemSchema = z.strictObject({
    time: z.string().trim().min(1, "Schedule item time cannot be empty"),
    title: z.string().trim().min(1, "Schedule item title cannot be empty"),
    kind: scheduleItemKindSchema.optional()
});

const scheduleDaySchema = z.strictObject({
    date: dateSchema.transform(d => d.toISOString()).nullable(),
    title: z.string().trim().min(1, "Schedule day title cannot be empty").optional(),
    items: z.array(scheduleItemSchema)
});

const venueSchema = z.strictObject({
    name: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    mapUrl: z.url("Venue mapUrl must be a valid URL").optional(),
    contactName: z.string().trim().min(1).optional(),
    contactTelegram: z.string().trim().min(1).optional()
});

const contactsSchema = z.strictObject({
    phone: z.string().trim().min(1).optional(),
    email: z.email("contacts.email must be a valid email").optional(),
    telegram: z.string().trim().min(1).optional()
});

const linksSchema = z.strictObject({
    site: z.url("links.site must be a valid URL").optional(),
    registrationForm: z.url("links.registrationForm must be a valid URL").optional(),
    googleMaps: z.url("links.googleMaps must be a valid URL").optional()
});

const pairingsSchema = z.array(
    z.array(
        z.array(z.number().int("Pairing player id must be an integer"))
            .length(4, "Each table must have exactly 4 players")
    )
).refine(
    (rounds) => {
        if (rounds.length === 0) return true;
        const firstTableCount = rounds[0]!.length;
        return rounds.every(r => r.length === firstTableCount);
    },
    { error: "All rounds must have the same number of tables" }
);

export const eventInfoSchema = z.strictObject({
    schedule: z.array(scheduleDaySchema).optional(),
    venue: venueSchema.optional(),
    contacts: contactsSchema.optional(),
    links: linksSchema.optional(),
    pairings: pairingsSchema.optional()
});

const eventSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
    description: z.string().max(500, "Description must be 500 characters or less").nullish(),
    type: eventTypeEnum,
    isCurrentRating: z.boolean().nullish(),
    dateFrom: dateSchema.nullish(),
    dateTo: dateSchema.nullish(),
    gameRulesId: z.number().int("gameRulesId must be an integer"),
    clubId: clubIdSchema.nullish(),
    maxParticipants: z.number().int("maxParticipants must be an integer").min(1, "maxParticipants must be at least 1").nullish(),
    registrationDeadline: dateSchema.nullish(),
    startingRating: z.number().int("startingRating must be an integer").default(0),
    minimumGamesForRating: z.number().int("minimumGamesForRating must be an integer").min(0).default(0),
    blockGameCreation: z.boolean().default(false),
    info: eventInfoSchema.nullish()
}).refine(
    (data) => {
        if (data.dateFrom && data.dateTo) {
            return data.dateFrom < data.dateTo;
        }
        return true;
    },
    { error: "dateFrom must be before dateTo", path: ["dateTo"] }
);

export const eventCreateSchema = z.object({
    body: eventSchema
});

export const eventUpdateSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema
    }),
    body: eventSchema
});

export const eventDeleteSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema
    })
});

export const eventGetListSchema = z.object({
    query: z.object({
        clubId: clubIdParamSchema.optional()
    }).optional()
});

export const getEventAchievementsSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema
    })
});
