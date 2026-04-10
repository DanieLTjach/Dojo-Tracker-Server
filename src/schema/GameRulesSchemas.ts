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

const gameRulesTableSchema = z.object({
    headers: z.array(z.string().trim().min(1, 'Table header is required')).min(1, 'Table must have at least one header'),
    rows: z.array(z.array(z.string())).min(1, 'Table must have at least one row'),
    rowTooltips: z.array(gameRulesTooltipSchema.nullable()).optional()
}).superRefine((table, ctx) => {
    for (const [index, row] of table.rows.entries()) {
        if (row.length !== table.headers.length) {
            ctx.addIssue({
                code: 'custom',
                path: ['rows', index],
                message: 'Each table row must have the same number of cells as headers'
            });
        }
    }

    if (table.rowTooltips && table.rowTooltips.length !== table.rows.length) {
        ctx.addIssue({
            code: 'custom',
            path: ['rowTooltips'],
            message: 'rowTooltips must have the same length as rows'
        });
    }
});

export const gameRulesDetailsSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('table'),
        link: gameRulesLinkSchema.optional(),
        table: gameRulesTableSchema
    }),
    z.object({
        type: z.literal('text'),
        link: gameRulesLinkSchema.optional(),
        text: z.string().trim().min(1, 'Text content is required'),
        tooltips: z.array(gameRulesTooltipSchema).optional()
    })
]);

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
