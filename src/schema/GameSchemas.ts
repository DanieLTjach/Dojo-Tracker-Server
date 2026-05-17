import { z } from 'zod';
import { userIdParamSchema, userIdSchema } from './UserSchemas.ts';
import { eventIdParamSchema, eventIdSchema } from './EventSchemas.ts';
import { clubIdParamSchema } from './ClubSchemas.ts';
import { dateSchema } from './CommonSchemas.ts';
import { gameRoundResultWithoutPointsSchema } from './GameRoundResultSchemas.ts';

export const windSchema = z.enum(['EAST', 'WEST', 'NORTH', 'SOUTH']);

export const gameIdParamSchema = z.coerce.number().int("Game ID must be an integer")

const playerDataSchema = z.object({
    userId: userIdSchema,
    points: z.number().int("Points must be an integer"),
    startPlace: windSchema.nullish(),
    chomboCount: z.number().int("Chombo count must be an integer").nonnegative().max(10).nullish()
});

const playerListSchema = z.array(playerDataSchema).refine((players) => {
    const startPlaces = players
        .map(p => p.startPlace)
        .filter((sp) => sp !== undefined);
    return new Set(startPlaces).size === startPlaces.length;
}, {
    message: "Each player must have a unique start place"
});

const trackedGamePlayerDataSchema = z.object({
    userId: userIdSchema,
    startPlace: windSchema
});

const trackedGamePlayerListSchema = z.array(trackedGamePlayerDataSchema).refine((players) => {
    const startPlaces = players.map(p => p.startPlace);
    return new Set(startPlaces).size === startPlaces.length;
}, {
    message: "Each player must have a unique start place"
});

export const trackedGameCreationSchema = z.object({
    body: z.object({
        eventId: eventIdSchema,
        players: trackedGamePlayerListSchema
    })
});

export const gameCreationSchema = z.object({
    body: z.object({
        eventId: eventIdSchema,
        playersData: playerListSchema,
        createdAt: dateSchema.nullish(),
        hideNewGameMessage: z.boolean().nullish(),
        tournamentRound: z.number().int().positive().nullish(),
        tournamentTable: z.string().min(1).nullish()
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
        eventId: eventIdParamSchema.optional(),
        clubId: clubIdParamSchema.optional(),
        sortOrder: z.enum(['asc', 'desc']).optional(),
        limit: z.coerce.number().int().positive().optional(),
        offset: z.coerce.number().int().nonnegative().optional()
    }).optional()
});

export const gameUpdateSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema
    }),
    body: z.object({
        eventId: eventIdSchema,
        playersData: playerListSchema,
        createdAt: dateSchema.nullish(),
        tournamentRound: z.number().int().positive().nullish(),
        tournamentTable: z.string().min(1).nullish()
    })
});

export const gameDeletionSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema
    })
});

export const roundIdParamSchema = z.coerce.number().int('Round ID must be an integer').positive();

export const gameRoundPostSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema,
        roundId: roundIdParamSchema
    }),
    body: gameRoundResultWithoutPointsSchema
});

export const gameRoundDeleteSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema,
        roundId: roundIdParamSchema
    })
});

export const gameFinishSchema = z.object({
    params: z.object({
        gameId: gameIdParamSchema
    })
});
