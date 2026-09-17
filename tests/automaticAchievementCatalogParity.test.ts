import { AUTOMATIC_ACHIEVEMENTS, getAutomaticCatalog } from '../src/data/automaticAchievementCatalog.ts';
import { MANUAL_ACHIEVEMENT_CODES } from '../src/data/manualAchievementCatalog.ts';
import { SUPPORTED_LOCALES, t } from '../src/i18n/index.ts';

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
