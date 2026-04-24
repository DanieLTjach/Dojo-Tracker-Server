import z from "zod";
import { gameRulesCatalog, type GameRulesCatalog, type RuleSpec } from '../data/gameRulesCatalog.ts';
import { gameRulesPresetsByKey } from '../data/gameRulesPresets.ts';
import type { GameRulesDetails, RuleValue } from '../model/EventModels.ts';
import { clubIdParamSchema } from './ClubSchemas.ts';

export const gameRulesIdSchema = z.number().int("Game Rules ID must be an integer");
export const gameRulesIdParamSchema = z.coerce.number().int("Game Rules ID must be an integer");

const linkLabelSchema = z.string().trim().min(1, 'Link label cannot be empty');

const gameRulesLinkSchema = z.strictObject({
    url: z.url('Link URL must be a valid URL'),
    label: linkLabelSchema
});

const customRuleCategorySchema = z.enum(['yaku', 'fu', 'rule']);

const customRuleValueSchema = z.union([
    z.boolean(),
    z.number().int(),
    z.string(),
]);

const customRuleNameSchema = z.string().trim().min(1, 'Custom rule name cannot be empty');
const customRuleTooltipSchema = z.string().trim().min(1, 'Custom rule tooltip cannot be empty');

const customRuleEntrySchema = z.strictObject({
    category: customRuleCategorySchema,
    value: customRuleValueSchema,
    name: customRuleNameSchema,
    tooltip: customRuleTooltipSchema.optional()
});

function ruleSpecToSchema(spec: RuleSpec): z.ZodType<RuleValue> {
    let schema: z.ZodType<RuleValue>;

    switch (spec.type) {
        case 'boolean':
            schema = z.boolean();
            break;
        case 'integer':
            schema = z.number().int(`${spec.key} must be an integer`);
            break;
        case 'string':
            schema = z.string();
            break;
        case 'enumString':
            schema = z.string().refine(
                value => spec.enum.includes(value),
                `${spec.key} must be one of: ${spec.enum.join(', ')}`
            );
            break;
        case 'enumInteger':
            schema = z.number().int(`${spec.key} must be an integer`).refine(
                value => spec.enum.includes(value),
                `${spec.key} must be one of: ${spec.enum.join(', ')}`
            );
            break;
    }

    if (spec.type === 'integer') {
        const numberSchema = schema as z.ZodNumber;
        schema = numberSchema
            .refine(value => spec.min === undefined || value >= spec.min, `${spec.key} must be >= ${spec.min}`)
            .refine(value => spec.max === undefined || value <= spec.max, `${spec.key} must be <= ${spec.max}`)
            .refine(value => spec.multipleOf === undefined || value % spec.multipleOf === 0, `${spec.key} must be a multiple of ${spec.multipleOf}`);
    }

    return schema;
}

export function buildDetailsSchema(catalog: GameRulesCatalog): z.ZodType<GameRulesDetails> {
    const allOptionalShape = Object.fromEntries(
        catalog.rules.map(spec => [spec.key, ruleSpecToSchema(spec).optional()])
    );
    const withRequiredShape = Object.fromEntries(
        catalog.rules.map(spec => [spec.key, spec.required ? ruleSpecToSchema(spec) : ruleSpecToSchema(spec).optional()])
    );
    const allOptionalRulesSchema = z.strictObject(allOptionalShape);
    const withRequiredRulesSchema = z.strictObject(withRequiredShape);

    const presetSchema = z.string().trim().min(1, 'Preset cannot be empty').refine(
        (key) => {
            const preset = gameRulesPresetsByKey.get(key);
            return preset !== undefined && !preset.internal;
        },
        { message: 'Unknown preset' }
    );

    const customRulesSchema = z.array(customRuleEntrySchema);

    return z.union([
        z.strictObject({
            preset: presetSchema,
            rules: allOptionalRulesSchema,
            links: z.array(gameRulesLinkSchema).optional(),
            customRules: customRulesSchema.optional()
        }),
        z.strictObject({
            rules: withRequiredRulesSchema,
            links: z.array(gameRulesLinkSchema).optional(),
            customRules: customRulesSchema.optional()
        })
    ]) as z.ZodType<GameRulesDetails>;
}

export const gameRulesDetailsSchema = buildDetailsSchema(gameRulesCatalog);

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

const umaEntrySchema = z.number().int();
const umaSchema = z.union([
    z.array(umaEntrySchema).min(3).max(4),
    z.array(z.array(umaEntrySchema).min(3).max(4)).min(1)
]);

export const gameRulesUpsertBodySchema = z.strictObject({
    name: z.string().trim().min(1, 'Name cannot be empty'),
    numberOfPlayers: z.union([z.literal(3), z.literal(4)]),
    uma: umaSchema,
    startingPoints: z.number().int().min(0),
    chomboPointsAfterUma: z.number().int().nullable(),
    umaTieBreak: z.enum(['WIND', 'DIVIDE']),
    clubId: z.number().int().nullable()
});

export const gameRulesCreateSchema = z.object({
    body: gameRulesUpsertBodySchema
});

export const gameRulesUpdateSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema
    }),
    body: gameRulesUpsertBodySchema
});

export const gameRulesDeleteSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema
    })
});
