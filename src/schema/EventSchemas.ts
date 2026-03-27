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

const eventSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
    description: z.string().max(500, "Description must be 500 characters or less").nullish(),
    type: eventTypeEnum,
    isCurrentRating: z.boolean().nullish(),
    dateFrom: dateSchema.nullish(),
    dateTo: dateSchema.nullish(),
    gameRulesId: z.number().int("gameRulesId must be an integer"),
    clubId: clubIdSchema.nullish()
}).refine(
    (data) => {
        if (data.dateFrom && data.dateTo) {
            return data.dateFrom < data.dateTo;
        }
        return true;
    },
    { message: "dateFrom must be before dateTo", path: ["dateTo"] }
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
