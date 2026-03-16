import z from "zod";
import { clubIdParamSchema } from './ClubSchemas.ts';

export const gameRulesIdSchema = z.number().int("Game Rules ID must be an integer");
export const gameRulesIdParamSchema = z.coerce.number().int("Game Rules ID must be an integer");

export const gameRulesGetByIdSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema
    })
});

export const gameRulesGetListSchema = z.object({
    query: z.object({
        clubId: clubIdParamSchema.optional()
    }).optional()
});
