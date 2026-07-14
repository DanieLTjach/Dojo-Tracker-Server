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
const HONBA_PATTERN = /^[23]x(?:0|[1-9]\d*00)$/;

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
            schema = spec.key === 'honba'
                ? z.string().regex(HONBA_PATTERN, 'honba must use 2x… or 3x… with a non-negative step-100 value')
                : z.string();
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

function notenPenaltyDividesCleanly(rules: Record<string, unknown>, numberOfPlayers: number): boolean {
    const notenPenalty = rules['noten_penalty'];
    if (typeof notenPenalty !== 'number') {
        return true;
    }
    return notenPenalty % notenPenaltyDivisorFor(numberOfPlayers) === 0;
}

// These custom refine messages are contract-coupled to publicCode() in
// GameRulesValidationUtil.ts, which maps each exact string to a user-facing
// validation code. Keep the two in sync — reword here, update the map there.
export const CORE_FIELD_MISMATCH_MESSAGES = {
    number_of_players: 'number_of_players must match top-level numberOfPlayers',
    starting_points: 'starting_points must match top-level startingPoints',
} as const;
export const NOTEN_PENALTY_DIVISIBILITY_MESSAGE =
    'noten_penalty must divide evenly among the noten players (a multiple of 6 for yonma, 2 for sanma)';
export const HONBA_PAYER_COUNT_MESSAGE = 'honba payer count must match top-level numberOfPlayers';

export function buildDetailsSchema(catalog: GameRulesCatalog): z.ZodType<GameRulesDetails> {
    const allOptionalShape = Object.fromEntries(
        catalog.rules.map(spec => [spec.key, ruleSpecToSchema(spec).optional()])
    );
    const allOptionalRulesSchema = z.strictObject(allOptionalShape);

    const presetSchema = z.string().trim().min(1, 'Preset cannot be empty').refine(
        key => {
            const preset = gameRulesPresetsByKey.get(key);
            return preset !== undefined && !preset.internal;
        },
        { error: 'Unknown preset' }
    );

    const customRulesSchema = z.array(customRuleEntrySchema);

    return z.strictObject({
        preset: presetSchema.optional(),
        rules: allOptionalRulesSchema,
        links: z.array(gameRulesLinkSchema).optional(),
        customRules: customRulesSchema.optional(),
    }) as z.ZodType<GameRulesDetails>;
}

export const gameRulesDetailsSchema = buildDetailsSchema(gameRulesCatalog);

export interface GameRulesCoreValidationContext {
    numberOfPlayers: number;
    startingPoints: number;
}

export function buildDetailsSchemaForCore(
    core: GameRulesCoreValidationContext,
    catalog: GameRulesCatalog = gameRulesCatalog
): z.ZodType<GameRulesDetails> {
    return buildDetailsSchema(catalog).superRefine((details, ctx) => {
        const duplicatePlayers = details.rules['number_of_players'];
        if (duplicatePlayers !== undefined && duplicatePlayers !== core.numberOfPlayers) {
            ctx.addIssue({
                code: 'custom',
                message: CORE_FIELD_MISMATCH_MESSAGES.number_of_players,
                path: ['rules', 'number_of_players'],
            });
        }

        const duplicateStartingPoints = details.rules['starting_points'];
        if (duplicateStartingPoints !== undefined && duplicateStartingPoints !== core.startingPoints) {
            ctx.addIssue({
                code: 'custom',
                message: CORE_FIELD_MISMATCH_MESSAGES.starting_points,
                path: ['rules', 'starting_points'],
            });
        }

        if (!notenPenaltyDividesCleanly(details.rules, core.numberOfPlayers)) {
            ctx.addIssue({
                code: 'custom',
                message: NOTEN_PENALTY_DIVISIBILITY_MESSAGE,
                path: ['rules', 'noten_penalty'],
            });
        }

        const honba = details.rules['honba'];
        if (typeof honba === 'string' && HONBA_PATTERN.test(honba)) {
            const payerCount = Number(honba.split('x')[0]);
            if (payerCount !== core.numberOfPlayers - 1) {
                ctx.addIssue({
                    code: 'custom',
                    message: HONBA_PAYER_COUNT_MESSAGE,
                    path: ['rules', 'honba'],
                });
            }
        }

        const redFives = details.rules['red_fives'];
        if (
            core.numberOfPlayers === 3 &&
            redFives !== undefined &&
            redFives !== 'none' &&
            redFives !== 'two_red_fives_five_pin_and_five_sou' &&
            redFives !== 'four_red_fives_two_pin_and_two_sou'
        ) {
            ctx.addIssue({
                code: 'custom',
                message: 'red_fives must represent 0, 2, or 4 red fives for sanma',
                path: ['rules', 'red_fives'],
            });
        }
    }) as z.ZodType<GameRulesDetails>;
}

export function parseGameRulesDetailsForCore(
    details: GameRulesDetails,
    core: GameRulesCoreValidationContext
): GameRulesDetails {
    const result = buildDetailsSchemaForCore(core).safeParse(details);
    if (result.success) return result.data;

    throw new z.ZodError(result.error.issues.map(issue => ({
        ...issue,
        path: ['details', ...issue.path],
    })));
}

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

const gameRulesCreateBodySchema = gameRulesUpsertBodySchema.extend({
    details: gameRulesDetailsSchema.optional(),
});

export const gameRulesCreateSchema = z.object({
    body: gameRulesCreateBodySchema,
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
