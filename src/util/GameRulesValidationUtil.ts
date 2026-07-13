import type { $ZodIssue } from 'zod/v4/core';
import { type SupportedLocale, t } from '../i18n/index.ts';

export interface GameRulesValidationErrorEntry {
    path: string;
    code: string;
    message: string;
}

interface ValidationIssueLike {
    code: string;
    path: PropertyKey[];
    message: string;
    errors?: ValidationIssueLike[][] | undefined;
    keys?: string[] | undefined;
}

function pathStartsWith(path: PropertyKey[], prefix: PropertyKey[]): boolean {
    return prefix.every((segment, index) => path[index] === segment);
}

function flattenIssue(issue: ValidationIssueLike, parentPath: PropertyKey[] = []): ValidationIssueLike[] {
    const path = pathStartsWith(issue.path, parentPath)
        ? issue.path
        : [...parentPath, ...issue.path];

    if (issue.code === 'invalid_union' && issue.errors) {
        return issue.errors.flatMap(branch => branch.flatMap(child => flattenIssue(child, path)));
    }

    if (issue.code === 'unrecognized_keys' && issue.keys) {
        return issue.keys.map(key => ({ ...issue, path: [...path, key] }));
    }

    return [{ ...issue, path }];
}

function publicPath(path: PropertyKey[]): string {
    const [first, ...rest] = path;
    const normalized = first === 'body' || first === 'params' || first === 'query'
        ? rest
        : path;
    return normalized.map(String).join('.');
}

function publicCode(issue: ValidationIssueLike): string {
    if (issue.message.includes('must match top-level')) return 'coreFieldMismatch';
    if (issue.message.startsWith('noten_penalty must divide evenly')) return 'notenPenaltySplit';
    if (issue.message.includes('must be an integer')) return 'integer';
    if (issue.message.includes('must be a multiple of')) return 'multipleOf';
    if (issue.message.includes('must be one of')) return 'invalidValue';

    switch (issue.code) {
        case 'invalid_type':
            return 'invalidType';
        case 'invalid_value':
            return 'invalidValue';
        case 'too_small':
            return 'tooSmall';
        case 'too_big':
            return 'tooBig';
        case 'invalid_format':
            return 'invalidFormat';
        case 'unrecognized_keys':
            return 'unknownField';
        default:
            return 'invalidValue';
    }
}

export function normalizeGameRulesValidationIssues(
    issues: readonly $ZodIssue[],
    locale: SupportedLocale
): GameRulesValidationErrorEntry[] {
    const seen = new Set<string>();
    const normalized: GameRulesValidationErrorEntry[] = [];

    for (const issue of issues.flatMap(issue => flattenIssue(issue as ValidationIssueLike))) {
        const path = publicPath(issue.path);
        const code = publicCode(issue);
        const dedupeKey = `${path}|${code}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        normalized.push({
            path,
            code,
            message: t(`errors.gameRulesValidation${code[0]?.toUpperCase()}${code.slice(1)}`, locale),
        });
    }

    return normalized;
}
