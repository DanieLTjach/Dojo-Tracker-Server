import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';

// Each src/i18n/locales/<locale>/*.yaml owns a distinct set of top-level sections;
// we parse them at load time with js-yaml and shallow-merge into one catalog per locale.
// Adding a new locale file needs no change here — just drop it into the locale directory.

export type TranslationParams = Record<string, string | number>;

type Catalog = Record<string, unknown>;

const localesDir = join(dirname(fileURLToPath(import.meta.url)), 'locales');

const DEFAULT_LOCALE = 'uk';

function loadLocale(locale: string): Catalog {
    const dir = join(localesDir, locale);
    const files = readdirSync(dir).filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
    return files.reduce<Catalog>((catalog, file) => {
        const parsed = yaml.load(readFileSync(join(dir, file), 'utf8'));
        return parsed && typeof parsed === 'object' ? Object.assign(catalog, parsed) : catalog;
    }, {});
}

const catalogs: Record<string, Catalog> = {
    [DEFAULT_LOCALE]: loadLocale(DEFAULT_LOCALE),
};

let currentLocale = DEFAULT_LOCALE;

function getCatalog(locale: string = currentLocale): Catalog {
    return catalogs[locale] ?? catalogs[DEFAULT_LOCALE]!;
}

export function getCurrentLocale(): string {
    return currentLocale;
}

export function setCurrentLocale(locale: string): void {
    currentLocale = catalogs[locale] ? locale : DEFAULT_LOCALE;
}

function read(catalog: Catalog, path: string): unknown {
    return path.split('.').reduce<unknown>(
        (value, segment) => (value && typeof value === 'object' ? (value as Catalog)[segment] : undefined),
        catalog,
    );
}

function interpolate(template: string, params: TranslationParams): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        const value = params[key];
        return value === undefined ? '' : String(value);
    });
}

/**
 * Resolves an i18n key (dot-path, e.g. `errors.gameNotFoundById`) to its translated string,
 * interpolating any `{{param}}` placeholders. Returns the key itself if it is missing from the
 * catalog, so a typo surfaces visibly instead of throwing.
 */
export function t(key: string, params?: TranslationParams): string {
    const template = read(getCatalog(), key);
    if (typeof template !== 'string') {
        return key;
    }
    return params ? interpolate(template, params) : template;
}
