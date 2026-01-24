import z from "zod";

export const eventIdSchema = z.number().int("Event ID must be an integer");
export const eventIdParamSchema = z.coerce.number().int("Event ID must be an integer");

export const eventGetByIdSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema
    })
});

const eventTypeEnum = z.enum(["SEASON", "TOURNAMENT"]);

export const eventCreateSchema = z.object({
    body: z.object({
        name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
        description: z.string().max(500, "Description must be 500 characters or less").optional(),
        type: eventTypeEnum,
        dateFrom: z.string().datetime("dateFrom must be valid ISO 8601 format").optional(),
        dateTo: z.string().datetime("dateTo must be valid ISO 8601 format").optional(),
        gameRulesId: z.number().int("gameRulesId must be an integer").optional()
    }).refine(
        (data) => {
            if (data.dateFrom && data.dateTo) {
                return new Date(data.dateFrom) < new Date(data.dateTo);
            }
            return true;
        },
        { message: "dateFrom must be before dateTo", path: ["dateTo"] }
    )
});

export const eventUpdateSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema
    }),
    body: z.object({
        name: z.string().min(1, "Name cannot be empty").max(100, "Name must be 100 characters or less").optional(),
        description: z.string().max(500, "Description must be 500 characters or less").optional(),
        type: eventTypeEnum.optional(),
        dateFrom: z.string().datetime("dateFrom must be valid ISO 8601 format").optional(),
        dateTo: z.string().datetime("dateTo must be valid ISO 8601 format").optional(),
        gameRulesId: z.number().int("gameRulesId must be an integer").optional()
    }).refine(
        (data) => {
            if (data.dateFrom && data.dateTo) {
                return new Date(data.dateFrom) < new Date(data.dateTo);
            }
            return true;
        },
        { message: "dateFrom must be before dateTo", path: ["dateTo"] }
    )
});

export const eventDeleteSchema = z.object({
    params: z.object({
        eventId: eventIdParamSchema
    })
});