import z from "zod";
import { clubIdParamSchema } from './ClubSchemas.ts';

export const gameRulesIdSchema = z.number().int("Game Rules ID must be an integer");
export const gameRulesIdParamSchema = z.coerce.number().int("Game Rules ID must be an integer");

const gameRulesTooltipSchema = z.object({
    label: z.string().trim().min(1, 'Tooltip label is required'),
    content: z.string().trim().min(1, 'Tooltip content is required')
});

const gameRulesLinkSchema = z.object({
    url: z.url('Link URL must be a valid URL'),
    label: z.string().trim().min(1, 'Link label is required')
});

const gameRulesDetailRuleSchema = z.object({
    rule: z.string().trim().min(1, 'Rule name is required'),
    value: z.string(),
    tooltip: gameRulesTooltipSchema.optional()
});

export const gameRulesDetailsSchema = z.object({
    links: z.array(gameRulesLinkSchema).optional(),
    rules: z.array(gameRulesDetailRuleSchema).min(1, 'Must have at least one rule'),
});

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

export const gameRulesDetailsUpdateSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema
    }),
    body: z.object({
        details: gameRulesDetailsSchema.nullable()
    })
});
