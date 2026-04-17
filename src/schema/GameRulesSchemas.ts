import z from "zod";
import { gameRulesCatalog, type GameRulesCatalog, type RuleSpec } from '../data/gameRulesCatalog.ts';
import { gameRulesPresetsByKey } from '../data/gameRulesPresets.ts';
import type { GameRulesDetails, RuleValue } from '../model/EventModels.ts';
import { clubIdParamSchema } from './ClubSchemas.ts';

export const gameRulesIdSchema = z.number().int("Game Rules ID must be an integer");
export const gameRulesIdParamSchema = z.coerce.number().int("Game Rules ID must be an integer");

const localeTextSchema = z.strictObject({
    uk: z.string().trim().min(1, 'Ukrainian text is required')
});

const linkLabelSchema = z.string().trim().min(1, 'Link label cannot be empty');

const gameRulesLinkSchema = z.strictObject({
    url: z.url('Link URL must be a valid URL'),
    label: linkLabelSchema
});

const clubRuleCategorySchema = z.enum(['yaku', 'fu', 'rule']);

const clubRuleValueSchema = z.union([
    z.boolean(),
    z.number().int(),
    z.string(),
]);

const clubRuleEntrySchema = z.strictObject({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Club rule key must be snake_case'),
    category: clubRuleCategorySchema,
    value: clubRuleValueSchema,
    name: localeTextSchema,
    tooltip: localeTextSchema.optional()
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
                value => (spec.enum ?? []).includes(value),
                `${spec.key} must be one of: ${(spec.enum ?? []).join(', ')}`
            );
            break;
        case 'enumInteger':
            schema = z.number().int(`${spec.key} must be an integer`).refine(
                value => (spec.enum ?? []).includes(value),
                `${spec.key} must be one of: ${(spec.enum ?? []).join(', ')}`
            );
            break;
    }

    if (spec.type === 'integer' || spec.type === 'enumInteger') {
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

    const presetSchema = z.string().trim().min(1, 'Preset cannot be empty').refine(
        (key) => {
            const preset = gameRulesPresetsByKey.get(key);
            return preset !== undefined && !preset.internal;
        },
        { message: 'Unknown preset' }
    );

    return z.strictObject({
        preset: presetSchema.optional(),
        rules: z.any(),
        links: z.array(gameRulesLinkSchema).optional(),
        clubRules: z.array(clubRuleEntrySchema).refine(
            entries => new Set(entries.map(entry => entry.key)).size === entries.length,
            'clubRules keys must be unique'
        ).optional()
    }).transform((val, ctx) => {
        const rulesSchema = val.preset
            ? z.strictObject(allOptionalShape)
            : z.strictObject(withRequiredShape);

        const result = rulesSchema.safeParse(val.rules);
        if (!result.success) {
            for (const issue of result.error.issues) {
                ctx.addIssue({ ...issue, path: ['rules', ...issue.path] });
            }
            return z.NEVER;
        }
        return { ...val, rules: result.data } as GameRulesDetails;
    }) as z.ZodType<GameRulesDetails>;
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
