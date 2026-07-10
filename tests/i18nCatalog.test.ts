import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '..', 'src', 'i18n', 'locales');

function loadCatalog(locale: string): Record<string, unknown> {
    const localeDir = path.join(localesDir, locale);
    return fs.readdirSync(localeDir)
        .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
        .sort()
        .reduce<Record<string, unknown>>((catalog, file) => {
            const parsed = yaml.load(fs.readFileSync(path.join(localeDir, file), 'utf8'));
            return parsed && typeof parsed === 'object' ? Object.assign(catalog, parsed) : catalog;
        }, {});
}

function flattenStringKeys(value: unknown, prefix = ''): string[] {
    if (typeof value === 'string') {
        return [prefix];
    }
    if (value === null || typeof value !== 'object') {
        return [];
    }
    return Object.entries(value)
        .flatMap(([key, child]) => flattenStringKeys(child, prefix ? `${prefix}.${key}` : key))
        .sort();
}

describe('i18n catalogs', () => {
    test('English and Ukrainian catalogs expose the same translation keys', () => {
        const ukKeys = flattenStringKeys(loadCatalog('uk'));
        const enKeys = flattenStringKeys(loadCatalog('en'));

        expect(enKeys).toEqual(ukKeys);
    });
});
