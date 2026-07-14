import { describe, expect, test } from '@jest/globals';
import { ZodError } from 'zod';
import { normalizeGameRulesValidationIssues } from '../src/util/GameRulesValidationUtil.ts';
import { HONBA_PAYER_COUNT_MESSAGE } from '../src/schema/GameRulesSchemas.ts';

describe('normalizeGameRulesValidationIssues', () => {
    test('flattens union issues into stable dotted paths and deduplicates them', () => {
        const error = new ZodError([{
            code: 'invalid_union',
            path: ['body', 'uma'],
            message: 'Invalid input',
            errors: [
                [{
                    code: 'invalid_type',
                    expected: 'number',
                    path: ['body', 'uma', 0],
                    message: 'Invalid input: expected number',
                }],
                [{
                    code: 'invalid_type',
                    expected: 'array',
                    path: ['body', 'uma', 0],
                    message: 'Invalid input: expected array',
                }],
            ],
        }]);

        expect(normalizeGameRulesValidationIssues(error.issues, 'en')).toEqual([{
            path: 'uma.0',
            code: 'invalidType',
            message: 'Enter a value of the expected type.',
        }]);
    });

    test('normalizes compatibility mismatch messages', () => {
        const error = new ZodError([{
            code: 'custom',
            path: ['body', 'details', 'rules', 'starting_points'],
            message: 'starting_points must match top-level startingPoints',
        }]);

        expect(normalizeGameRulesValidationIssues(error.issues, 'uk')).toEqual([{
            path: 'details.rules.starting_points',
            code: 'coreFieldMismatch',
            message: 'Значення має збігатися з основним налаштуванням набору правил.',
        }]);
    });

    test('gives honba payer-count mismatch its own code rather than coreFieldMismatch', () => {
        const error = new ZodError([{
            code: 'custom',
            path: ['body', 'details', 'rules', 'honba'],
            message: HONBA_PAYER_COUNT_MESSAGE,
        }]);

        expect(normalizeGameRulesValidationIssues(error.issues, 'en')).toEqual([{
            path: 'details.rules.honba',
            code: 'honbaPayerCount',
            message: 'The honba value must match the number of paying players for this ruleset.',
        }]);
    });
});
