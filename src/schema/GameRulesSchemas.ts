import z from 'zod';
import { gameRulesCatalog, type GameRulesCatalog, type RuleSpec } from '../data/gameRulesCatalog.ts';
import { gameRulesPresetsByKey } from '../data/gameRulesPresets.ts';
import type { GameRulesDetails, RuleValue } from '../model/EventModels.ts';
import { clubIdParamSchema } from './ClubSchemas.ts';

export const gameRulesIdSchema = z.number().int('Game Rules ID must be an integer');
export const gameRulesIdParamSchema = z.coerce.number().int('Game Rules ID must be an integer');

const linkLabelSchema = z.string().trim().min(1, 'Link label cannot be empty');

const gameRulesLinkSchema = z.strictObject({
    url: z.url('Link URL must be a valid URL'),
    label: linkLabelSchema,
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
    tooltip: customRuleTooltipSchema.optional(),
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
            .refine(
                value => spec.multipleOf === undefined || value % spec.multipleOf === 0,
                `${spec.key} must be a multiple of ${spec.multipleOf}`
            );
    }

    return schema;
}

// Noten payments must stay whole: yonma can split 1/2/3 ways (LCM 6),
// sanma can split 1/2 ways (LCM 2).
export function notenPenaltyDivisorFor(numberOfPlayers: number): number {
    return numberOfPlayers === 3 ? 2 : 6;
}

// Resolve number_of_players from explicit rules first, then preset defaults.
// Missing values are handled by the regular required-field validation.
function notenPenaltyDividesCleanly(rules: Record<string, unknown>, presetKey?: string): boolean {
    const notenPenalty = rules['noten_penalty'];
    if (typeof notenPenalty !== 'number') {
        return true;
    }
    const presetPlayers = presetKey
        ? gameRulesPresetsByKey.get(presetKey)?.rules?.['number_of_players']
        : undefined;
    const numberOfPlayers = typeof rules['number_of_players'] === 'number'
        ? rules['number_of_players'] as number
        : (typeof presetPlayers === 'number' ? presetPlayers : undefined);
    if (numberOfPlayers === undefined) {
        return true;
    }
    return notenPenalty % notenPenaltyDivisorFor(numberOfPlayers) === 0;
}

const NOTEN_PENALTY_DIVISIBILITY_MESSAGE =
    'noten_penalty must divide evenly among the noten players (a multiple of 6 for yonma, 2 for sanma)';

export function buildDetailsSchema(catalog: GameRulesCatalog): z.ZodType<GameRulesDetails> {
    const allOptionalShape = Object.fromEntries(
        catalog.rules.map(spec => [spec.key, ruleSpecToSchema(spec).optional()])
    );
    const withRequiredShape = Object.fromEntries(
        catalog.rules.map(
            spec => [spec.key, spec.required ? ruleSpecToSchema(spec) : ruleSpecToSchema(spec).optional()]
        )
    );
    const allOptionalRulesSchema = z.strictObject(allOptionalShape);
    const withRequiredRulesSchema = z.strictObject(withRequiredShape);

    const presetSchema = z.string().trim().min(1, 'Preset cannot be empty').refine(
        key => {
            const preset = gameRulesPresetsByKey.get(key);
            return preset !== undefined && !preset.internal;
        },
        { error: 'Unknown preset' }
    );

    const customRulesSchema = z.array(customRuleEntrySchema);

    return z.union([
        z.strictObject({
            preset: presetSchema,
            rules: allOptionalRulesSchema,
            links: z.array(gameRulesLinkSchema).optional(),
            customRules: customRulesSchema.optional(),
        }).refine(
            details => notenPenaltyDividesCleanly(details.rules, details.preset),
            { error: NOTEN_PENALTY_DIVISIBILITY_MESSAGE, path: ['rules', 'noten_penalty'] }
        ),
        z.strictObject({
            rules: withRequiredRulesSchema,
            links: z.array(gameRulesLinkSchema).optional(),
            customRules: customRulesSchema.optional(),
        }).refine(
            details => notenPenaltyDividesCleanly(details.rules),
            { error: NOTEN_PENALTY_DIVISIBILITY_MESSAGE, path: ['rules', 'noten_penalty'] }
        ),
    ]) as z.ZodType<GameRulesDetails>;
}

export const gameRulesDetailsSchema = buildDetailsSchema(gameRulesCatalog);

export const gameRulesGetByIdSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema,
    }),
});

export const gameRulesGetListSchema = z.object({
    query: z.object({
        clubId: clubIdParamSchema.optional(),
    }).optional(),
});

export const gameRulesDetailsUpdateSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema,
    }),
    body: z.object({
        details: gameRulesDetailsSchema,
    }),
});

const umaEntrySchema = z.number().int();
const umaSchema = z.union([
    z.array(umaEntrySchema).min(3).max(4),
    z.array(z.array(umaEntrySchema).min(3).max(4)).min(1),
]);

export const gameRulesUpsertBodySchema = z.strictObject({
    name: z.string().trim().min(1, 'Name cannot be empty'),
    numberOfPlayers: z.union([z.literal(3), z.literal(4)]),
    uma: umaSchema,
    startingPoints: z.number().int().min(0),
    umaTieBreak: z.enum(['WIND', 'DIVIDE']),
    clubId: z.number().int().nullable(),
});

export const gameRulesCreateSchema = z.object({
    body: gameRulesUpsertBodySchema,
});

const gameRulesUpdateBodySchema = gameRulesUpsertBodySchema.extend({
    details: gameRulesDetailsSchema.optional(),
});

export const gameRulesUpdateSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema,
    }),
    body: gameRulesUpdateBodySchema,
});

export const gameRulesDeleteSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema,
    }),
});
