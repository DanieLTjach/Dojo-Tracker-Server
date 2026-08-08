import {
    DEFAULT_MU,
    DEFAULT_SIGMA,
    INACTIVITY_SIGMA_RATE,
    MAX_SIGMA,
} from '../src/model/SkillModels.ts';
import {
    daysSince,
    inflateSigma,
    rateGame,
    toDisplaySkill,
    toOrdinal,
} from '../src/util/SkillMathUtil.ts';

describe('SkillMathUtil', () => {
    describe('daysSince', () => {
        test('returns 0 for same or future dates', () => {
            const now = new Date('2026-06-01T00:00:00.000Z');
            expect(daysSince(now, now)).toBe(0);
            expect(daysSince(new Date('2026-06-02T00:00:00.000Z'), now)).toBe(0);
        });

        test('returns correct whole days for past dates', () => {
            const now = new Date('2026-06-11T12:00:00.000Z');
            const past = new Date('2026-06-01T12:00:00.000Z');
            expect(daysSince(past, now)).toBe(10);
        });
    });

    describe('inflateSigma', () => {
        const baseDate = new Date('2026-01-01T00:00:00.000Z');

        test('returns untouched sigma within grace period (0-30 days)', () => {
            const currentSigma = 2.5;

            const day0 = new Date('2026-01-01T00:00:00.000Z');
            const day15 = new Date('2026-01-16T00:00:00.000Z');
            const day30 = new Date('2026-01-31T00:00:00.000Z');

            expect(inflateSigma(currentSigma, baseDate, day0)).toBe(currentSigma);
            expect(inflateSigma(currentSigma, baseDate, day15)).toBe(currentSigma);
            expect(inflateSigma(currentSigma, baseDate, day30)).toBe(currentSigma);
        });

        test('inflates linearly after 30-day grace period', () => {
            const currentSigma = 2.5;
            // 130 days since game = 100 days of inactivity
            const day130 = new Date(baseDate.getTime() + 130 * 24 * 60 * 60 * 1000);
            const expected = currentSigma + 100 * INACTIVITY_SIGMA_RATE; // 2.5 + 0.15 = 2.65

            expect(inflateSigma(currentSigma, baseDate, day130)).toBeCloseTo(expected, 6);
        });

        test('caps inflated sigma at MAX_SIGMA (25/3)', () => {
            const currentSigma = 2.5;
            // 10000 days later
            const future = new Date(baseDate.getTime() + 10000 * 24 * 60 * 60 * 1000);
            expect(inflateSigma(currentSigma, baseDate, future)).toBe(MAX_SIGMA);
        });

        test('never decreases sigma even if input is already at or above MAX_SIGMA', () => {
            expect(inflateSigma(MAX_SIGMA, baseDate, baseDate)).toBe(MAX_SIGMA);
            const future = new Date(baseDate.getTime() + 50 * 24 * 60 * 60 * 1000);
            expect(inflateSigma(MAX_SIGMA, baseDate, future)).toBe(MAX_SIGMA);
        });
    });

    describe('toDisplaySkill and toOrdinal', () => {
        test('default (25, 25/3) maps to ordinal 0 and display skill 1500', () => {
            expect(toOrdinal(DEFAULT_MU, DEFAULT_SIGMA)).toBeCloseTo(0, 6);
            expect(toDisplaySkill(DEFAULT_MU, DEFAULT_SIGMA)).toBe(1500);
        });

        test('higher mu increases skill; higher sigma decreases skill', () => {
            const baseSkill = toDisplaySkill(25, 3.0);
            const higherMuSkill = toDisplaySkill(26, 3.0);
            const higherSigmaSkill = toDisplaySkill(25, 3.5);

            expect(higherMuSkill).toBeGreaterThan(baseSkill);
            expect(higherSigmaSkill).toBeLessThan(baseSkill);
        });
    });

    describe('rateGame', () => {
        test('rates 4-player game with winning player gaining mu and all sigmas decreasing', () => {
            const players = [
                { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
                { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
                { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
                { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
            ];
            const ranks = [1, 2, 3, 4];

            const results = rateGame(players, ranks);
            expect(results).toHaveLength(4);

            // 1st place mu > 25
            expect(results[0]!.mu).toBeGreaterThan(DEFAULT_MU);
            // 4th place mu < 25
            expect(results[3]!.mu).toBeLessThan(DEFAULT_MU);
            // Monotonic mu by rank
            expect(results[0]!.mu).toBeGreaterThan(results[1]!.mu);
            expect(results[1]!.mu).toBeGreaterThan(results[2]!.mu);
            expect(results[2]!.mu).toBeGreaterThan(results[3]!.mu);

            // All sigmas decreased after playing
            for (const res of results) {
                expect(res.sigma).toBeLessThan(DEFAULT_SIGMA);
            }
        });

        test('rates 3-player game (sanma)', () => {
            const players = [
                { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
                { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
                { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
            ];
            const ranks = [1, 2, 3];

            const results = rateGame(players, ranks);
            expect(results).toHaveLength(3);
            expect(results[0]!.mu).toBeGreaterThan(results[1]!.mu);
            expect(results[1]!.mu).toBeGreaterThan(results[2]!.mu);
        });

        test('throws on invalid inputs', () => {
            expect(() => rateGame([{ mu: 25, sigma: 8.33 }], [1])).toThrow();
            expect(() => rateGame([{ mu: 25, sigma: 8.33 }, { mu: 25, sigma: 8.33 }], [1])).toThrow();
        });
    });
});
