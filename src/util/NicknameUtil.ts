import { randomInt } from 'node:crypto';

export const NICKNAME_PATTERN = /^@[A-Za-z0-9_]{3,32}$/;

const adjectives = ['agile', 'brisk', 'calm', 'clever', 'cosmic', 'daring', 'eager', 'eclectic'];
const nouns = ['badger', 'crane', 'dingo', 'falcon', 'fox', 'gecko', 'heron', 'koala'];

export function normalizeProviderUsername(raw?: string): string | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const withPrefix = raw.startsWith('@') ? raw : `@${raw}`;
    const normalized = `@${withPrefix.slice(1).replace(/[.-]/g, '_')}`;
    return NICKNAME_PATTERN.test(normalized) ? normalized : undefined;
}

export function generateReadableNickname(random = randomInt): string {
    const adjective = adjectives[random(adjectives.length)];
    const noun = nouns[random(nouns.length)];
    const digits = String(random(1000)).padStart(3, '0');
    return `@${adjective}_${noun}_${digits}`;
}
