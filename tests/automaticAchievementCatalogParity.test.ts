import { AUTOMATIC_ACHIEVEMENTS, getAutomaticCatalog } from '../src/data/automaticAchievementCatalog.ts';
import { MANUAL_ACHIEVEMENT_CODES } from '../src/data/manualAchievementCatalog.ts';
import { SUPPORTED_LOCALES, t } from '../src/i18n/index.ts';
import { toDisplaySkill } from '../src/util/SkillMathUtil.ts';
import { SKILL_DISPLAY_BASE, SKILL_DISPLAY_SCALE } from '../src/model/SkillModels.ts';

describe('automatic achievement catalog parity', () => {
    it('has unique codes', () => {
        const codes = AUTOMATIC_ACHIEVEMENTS.map(def => def.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it.each(SUPPORTED_LOCALES)('has name and description for every achievement in %s', locale => {
        for (const def of AUTOMATIC_ACHIEVEMENTS) {
            const nameKey = `achievements.automatic.${def.code}.name`;
            const descriptionKey = `achievements.automatic.${def.code}.description`;
            // t() returns the key itself when the translation is missing
            expect(t(nameKey, locale)).not.toBe(nameKey);
            expect(t(descriptionKey, locale)).not.toBe(descriptionKey);
        }
    });

    it.each(SUPPORTED_LOCALES)('has a unit template for every value unit in %s', locale => {
        const units = [...new Set(AUTOMATIC_ACHIEVEMENTS.map(def => def.valueUnit))];
        for (const unit of units) {
            const unitKey = `achievements.units.${unit}`;
            expect(t(unitKey, locale, { value: 1 })).not.toBe(unitKey);
        }
    });

    it.each(SUPPORTED_LOCALES)('has name and description for every manual achievement in %s', locale => {
        for (const code of MANUAL_ACHIEVEMENT_CODES) {
            const nameKey = `achievements.manual.${code}.name`;
            const descriptionKey = `achievements.manual.${code}.description`;
            expect(t(nameKey, locale)).not.toBe(nameKey);
            expect(t(descriptionKey, locale)).not.toBe(descriptionKey);
        }
    });
});

// The client renders every catalog entry, including ones this player can never
// unlock yet, and explains *why* each locked one is locked. That explanation is
// only possible if both eligibility flags survive the wire - `gameSize` was
// omitted once, which left sanma achievements greyed out with no reason given.
describe('catalog eligibility flags', () => {
    it('ships every achievement, not a per-user subset', () => {
        expect(getAutomaticCatalog('en')).toHaveLength(AUTOMATIC_ACHIEVEMENTS.length);
    });

    it('exposes gameSize and trackedOnly for every definition that sets them', () => {
        const entries = new Map(getAutomaticCatalog('en').map(entry => [entry.code, entry]));

        for (const def of AUTOMATIC_ACHIEVEMENTS) {
            const entry = entries.get(def.code);
            expect(entry).toBeDefined();
            expect(entry!.gameSize).toBe(def.gameSize);
            expect(entry!.trackedOnly).toBe(def.trackedOnly);
        }
    });

    it('carries the sanma-only codes that drive the locked reason', () => {
        const sanma = getAutomaticCatalog('en').filter(entry => entry.gameSize === 3);
        expect(sanma.length).toBe(AUTOMATIC_ACHIEVEMENTS.filter(d => d.gameSize === 3).length);
        expect(sanma.length).toBeGreaterThan(0);
    });
});

// The bug that made six OpenSkill achievements permanently unreachable lived at
// this seam, not in the evaluator: the evaluator's unit tests hand it
// `finalDisplayRating: 1650` and pass, while production passed it the raw
// ordinal (~27). Pin the conversion itself.
describe('display rating conversion feeding the evaluator', () => {
    it('converts mu/sigma into the 1500-based rating the player sees', () => {
        // A mid-table player: raw ordinal ~10, display ~1720.
        expect(toDisplaySkill(25, 5)).toBe(SKILL_DISPLAY_BASE + SKILL_DISPLAY_SCALE * 10);
    });

    it('produces values on the same scale as the peak targets', () => {
        // A strong player must be able to cross 1600 - under the raw ordinal this
        // was ~27 and no peak achievement could ever fire.
        expect(toDisplaySkill(28, 2)).toBeGreaterThan(1600);
    });

    it('always returns a whole number, so progress never shows a float', () => {
        for (const [mu, sigma] of [[25, 5], [26.4, 3.17], [30.01, 2.004]]) {
            expect(Number.isInteger(toDisplaySkill(mu!, sigma!))).toBe(true);
        }
    });
});
