import {
    MAJSOUL_RANK_CODES,
    MAJSOUL_RANK_TIERS,
    isMajsoulRankCode,
    majsoulRankTier,
    tierHasLevels,
} from '../src/data/majsoulRanks.ts';

describe('majsoulRanks', () => {
    it('lists 16 ranks: five tiers of three, plus celestial', () => {
        expect(MAJSOUL_RANK_CODES).toHaveLength(16);
        expect(MAJSOUL_RANK_TIERS).toHaveLength(6);
    });

    it('orders codes weakest first, so a picker can render them top-down', () => {
        expect(MAJSOUL_RANK_CODES[0]).toBe('novice_1');
        expect(MAJSOUL_RANK_CODES.at(-1)).toBe('celestial');
    });

    it('gives celestial no level suffix, since the game does not subdivide it', () => {
        expect(tierHasLevels('celestial')).toBe(false);
        expect(isMajsoulRankCode('celestial')).toBe(true);
        expect(isMajsoulRankCode('celestial_1')).toBe(false);
    });

    it('subdivides every other tier into three', () => {
        for (const tier of MAJSOUL_RANK_TIERS.filter(tierHasLevels)) {
            expect(isMajsoulRankCode(`${tier}_1`)).toBe(true);
            expect(isMajsoulRankCode(`${tier}_3`)).toBe(true);
            expect(isMajsoulRankCode(`${tier}_4`)).toBe(false);
        }
    });

    it('reads the tier back off a code, and refuses an unknown one', () => {
        expect(majsoulRankTier('expert_2')).toBe('expert');
        expect(majsoulRankTier('celestial')).toBe('celestial');
        expect(majsoulRankTier('grandmaster_1')).toBeUndefined();
    });
});
