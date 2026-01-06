import z from "zod";
import { eventIdParamSchema } from "./EventSchemas.ts";
import { userIdParamSchema } from "./UserSchemas.ts";
import { dateSchema } from "./CommonSchemas.ts";

export const getAllUsersCurrentRatingSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema
    })
});

export const getAllUsersTotalRatingChangeDuringPeriodSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema
    }),
    query: z.object({
        dateFrom: dateSchema,
        dateTo: dateSchema
    })
});

export const getUserRatingHistorySchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema,
        userId: userIdParamSchema
    })
});
