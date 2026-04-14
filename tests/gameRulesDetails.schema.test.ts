import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { gameRulesDetailsSchema } from '../src/schema/GameRulesSchemas.ts';

describe('gameRulesDetailsSchema V2', () => {
    test('accepts EMA 2025 structured blocks fixture', () => {
        const details = JSON.parse(readFileSync('db/data/ema-2025-rules-details-structured-blocks-review.json', 'utf-8'));

        const result = gameRulesDetailsSchema.safeParse(details);

        expect(result.success).toBe(true);
    });

    test('rejects flat V1 details', () => {
        const v1Details = {
            links: [{ url: 'https://example.test/rules', label: 'Rules' }],
            rules: [
                {
                    rule: 'Кількість гравців',
                    value: '4',
                    tooltip: { label: 'Кількість гравців', content: 'Flat tooltip text' }
                }
            ]
        };

        const result = gameRulesDetailsSchema.safeParse(v1Details);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(issue => issue.path.includes('sections'))).toBe(true);
        }
    });

    test('rejects malformed tooltip blocks', () => {
        const details = {
            sections: [
                {
                    name: 'Section',
                    groups: [
                        {
                            name: 'Group',
                            rules: [
                                {
                                    rule: 'Rule',
                                    value: 'Value',
                                    tooltip: {
                                        label: 'Tooltip',
                                        content: [{ type: 'paragraph' }]
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        const result = gameRulesDetailsSchema.safeParse(details);

        expect(result.success).toBe(false);
    });

    test('rejects unknown tooltip block type', () => {
        const details = {
            sections: [
                {
                    name: 'Section',
                    groups: [
                        {
                            name: 'Group',
                            rules: [
                                {
                                    rule: 'Rule',
                                    value: 'Value',
                                    tooltip: {
                                        label: 'Tooltip',
                                        content: [{ type: 'table', rows: [] }]
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        const result = gameRulesDetailsSchema.safeParse(details);

        expect(result.success).toBe(false);
    });
});
