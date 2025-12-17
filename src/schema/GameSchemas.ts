import { z } from 'zod';
import { telegramUsernameSchema, userIdParamSchema, userIdSchema, userNameSchema } from './UserSchemas.ts';

export const gameStartPlace = z.enum(['EAST', 'WEST', 'NORTH', 'SOUTH']);

export const gameIdParamSchema = z.coerce.number().int("Game ID must be an integer")
const eventIdSchema = z.number().int("Event ID must be an integer");
const eventIdParamSchema = z.coerce.number().int("Event ID must be an integer");

const dateSchema = z.coerce.date("Invalid date format");

const userDataSchema = z.object({
    telegramUsername: telegramUsernameSchema.optional(),
    name: userNameSchema.optional()
}).refine((data) => data.telegramUsername || data.name, {
    message: "At least one of 'telegramUsername' or 'name' must be provided"
});

const playerDataSchema = z.object({
    user: userDataSchema,
    points: z.number().int("Points must be an integer"),
    startPlace: gameStartPlace.optional()
});

const playerListSchema = z.array(playerDataSchema);

export const gameCreationSchema = z.object({
    body: z.object({
        eventId: eventIdSchema,
        playersData: playerListSchema,
        createdBy: userIdSchema
    })
});

export const gameGetByIdSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema
    })
});

export const gameGetListSchema = z.object({
    query: z.object({
        dateFrom: dateSchema.optional(),
        dateTo: dateSchema.optional(),
        userId: userIdParamSchema.optional(), 
        eventId: eventIdParamSchema.optional()
    }).optional()
});

export const gameUpdateSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema
    }),
    body: z.object({
        eventId: eventIdSchema,
        playersData: playerListSchema,
        modifiedBy: userIdSchema
    })
});

export const gameDeletionSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema
    }),
    body: z.object({
        deletedBy: userIdSchema
    })
});

