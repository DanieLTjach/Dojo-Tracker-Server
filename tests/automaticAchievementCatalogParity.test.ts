import { AUTOMATIC_ACHIEVEMENTS } from '../src/data/automaticAchievementCatalog.ts';
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
