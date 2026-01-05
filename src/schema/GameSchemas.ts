import { z } from 'zod';
import { userIdParamSchema, userIdSchema } from './UserSchemas.ts';

export const gameStartPlace = z.enum(['EAST', 'WEST', 'NORTH', 'SOUTH']);

export const gameIdParamSchema = z.coerce.number().int("Game ID must be an integer")
const eventIdSchema = z.number().int("Event ID must be an integer");
const eventIdParamSchema = z.coerce.number().int("Event ID must be an integer");

const dateSchema = z.coerce.date("Invalid date format");

const playerDataSchema = z.object({
    userId: userIdSchema,
    points: z.number().int("Points must be an integer"),
    startPlace: gameStartPlace.optional()
});

const playerListSchema = z.array(playerDataSchema).refine((players) => {
    const startPlaces = players
        .map(p => p.startPlace)
        .filter((sp) => sp !== undefined);
    return new Set(startPlaces).size === startPlaces.length;
}, {
    message: "Each player must have a unique start place"
});

export const gameCreationSchema = z.object({
    body: z.object({
        eventId: eventIdSchema,
        playersData: playerListSchema
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
        playersData: playerListSchema
    })
});

export const gameDeletionSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema
    })
});

