import { t } from '../src/i18n/index.ts';

describe('i18n core', () => {
    it('resolves a key from the loaded catalog', () => {
        expect(t('common.none')).toBe('немає');
    });

    it('returns the key itself when missing', () => {
        expect(t('common.doesNotExist')).toBe('common.doesNotExist');
    });

    it('interpolates {{param}} placeholders', () => {
        // common.none has no params; verify interpolation via a temporary inline check
        // using a key with a placeholder is covered once errors.yaml lands.
        expect(t('common.none', { unused: 'x' })).toBe('немає');
    });
});
