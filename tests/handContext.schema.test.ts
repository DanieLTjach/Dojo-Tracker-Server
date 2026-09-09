import { describe, expect, it } from '@jest/globals';
import { handContextSchema } from '../src/schema/GameRoundResultSchemas.ts';

describe('handContextSchema localYaku validation', () => {
    it('accepts context when localYaku is absent', () => {
        const result = handContextSchema.safeParse({
            ippatsu: true,
        });
        expect(result.success).toBe(true);
    });

    it('accepts context with valid localYaku array', () => {
        const result = handContextSchema.safeParse({
            localYaku: ['tsubame_gaeshi'],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.localYaku).toEqual(['tsubame_gaeshi']);
        }
    });

    it('accepts context with multiple unique local yaku up to 8', () => {
        const result = handContextSchema.safeParse({
            localYaku: ['tsubame_gaeshi', 'sanrenkou', 'uumensai'],
        });
        expect(result.success).toBe(true);
    });

    it('rejects duplicate local yaku entries', () => {
        const result = handContextSchema.safeParse({
            localYaku: ['tsubame_gaeshi', 'tsubame_gaeshi'],
        });
        expect(result.success).toBe(false);
    });

    it('rejects more than 8 local yaku entries', () => {
        const result = handContextSchema.safeParse({
            localYaku: ['y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7', 'y8', 'y9'],
        });
        expect(result.success).toBe(false);
    });

    it('rejects empty string in localYaku', () => {
        const result = handContextSchema.safeParse({
            localYaku: [''],
        });
        expect(result.success).toBe(false);
    });

    it('rejects invalid format strings with spaces or uppercase', () => {
        const result = handContextSchema.safeParse({
            localYaku: ['Tsubame Gaeshi'],
        });
        expect(result.success).toBe(false);
    });

    it('rejects non-array localYaku', () => {
        const result = handContextSchema.safeParse({
            localYaku: 'tsubame_gaeshi',
        });
        expect(result.success).toBe(false);
    });
});
