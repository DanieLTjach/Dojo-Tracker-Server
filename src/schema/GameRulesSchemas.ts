import z from "zod";
import { clubIdParamSchema } from './ClubSchemas.ts';

export const gameRulesIdSchema = z.number().int("Game Rules ID must be an integer");
export const gameRulesIdParamSchema = z.coerce.number().int("Game Rules ID must be an integer");

const tooltipParagraphBlockSchema = z.strictObject({
    type: z.literal('paragraph'),
    text: z.string().trim().min(1, 'Tooltip paragraph text is required')
});

const tooltipListBlockSchema = z.strictObject({
    type: z.literal('list'),
    items: z.array(z.string().trim().min(1, 'Tooltip list item is required')).min(1, 'Tooltip list must have at least one item')
});

const tooltipDefinitionListBlockSchema = z.strictObject({
    type: z.literal('definitionList'),
    items: z.array(z.strictObject({
        term: z.string().trim().min(1, 'Tooltip definition term is required'),
        description: z.string().trim().min(1, 'Tooltip definition description is required')
    })).min(1, 'Tooltip definition list must have at least one item')
});

const tooltipExampleBlockSchema = z.strictObject({
    type: z.literal('example'),
    text: z.string().trim().min(1, 'Tooltip example text is required')
});

const tooltipBlockSchema = z.discriminatedUnion('type', [
    tooltipParagraphBlockSchema,
    tooltipListBlockSchema,
    tooltipDefinitionListBlockSchema,
    tooltipExampleBlockSchema
]);

const gameRulesTooltipSchema = z.strictObject({
    label: z.string().trim().min(1, 'Tooltip label is required'),
    content: z.array(tooltipBlockSchema).min(1, 'Tooltip content must have at least one block')
});

const gameRulesLinkSchema = z.strictObject({
    url: z.url('Link URL must be a valid URL'),
    label: z.string().trim().min(1, 'Link label is required')
});

const gameRulesDetailRuleSchema = z.strictObject({
    rule: z.string().trim().min(1, 'Rule name is required'),
    value: z.string(),
    tooltip: gameRulesTooltipSchema.optional()
});

const gameRulesGroupSchema = z.strictObject({
    name: z.string().trim().min(1, 'Group name is required'),
    tooltip: gameRulesTooltipSchema.optional(),
    rules: z.array(gameRulesDetailRuleSchema).min(1, 'Group must have at least one rule')
});

const gameRulesSectionSchema = z.strictObject({
    name: z.string().trim().min(1, 'Section name is required'),
    tooltip: gameRulesTooltipSchema.optional(),
    groups: z.array(gameRulesGroupSchema).min(1, 'Section must have at least one group')
});

export const gameRulesDetailsSchema = z.strictObject({
    links: z.array(gameRulesLinkSchema).optional(),
    sections: z.array(gameRulesSectionSchema).min(1, 'Must have at least one section'),
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
