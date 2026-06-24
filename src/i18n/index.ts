import { existsSync, readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';

// Each src/i18n/locales/<locale>/*.yaml owns a distinct set of top-level sections.
// We parse them at load time and shallow-merge into one catalog per locale.

export type TranslationParamValue = string | number | boolean | null | undefined;
export type TranslationParams = Record<string, TranslationParamValue>;

type Catalog = Record<string, unknown>;

const localesDir = join(dirname(fileURLToPath(import.meta.url)), 'locales');

export const DEFAULT_LOCALE = 'uk';
export const SUPPORTED_LOCALES = ['en', 'uk'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

function loadLocale(locale: string): Catalog {
    const dir = join(localesDir, locale);
    if (!existsSync(dir)) {
        return {};
    }
    const files = readdirSync(dir).filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
    return files.reduce<Catalog>((catalog, file) => {
        const parsed = yaml.load(readFileSync(join(dir, file), 'utf8'));
        return parsed && typeof parsed === 'object' ? Object.assign(catalog, parsed) : catalog;
    }, {});
}

function loadCatalogs(): Record<string, Catalog> {
    const localeDirs = readdirSync(localesDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    const locales = new Set([DEFAULT_LOCALE, ...SUPPORTED_LOCALES, ...localeDirs]);
    return Object.fromEntries([...locales].map(locale => [locale, loadLocale(locale)]));
}

const catalogs: Record<string, Catalog> = loadCatalogs();

function read(catalog: Catalog, path: string): unknown {
    return path.split('.').reduce<unknown>(
        (value, segment) => (value && typeof value === 'object' ? (value as Catalog)[segment] : undefined),
        catalog
    );
}

function interpolate(template: string, params: TranslationParams): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        const value = params[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

export function isSupportedLocale(locale: string): boolean {
    return Object.hasOwn(catalogs, locale);
}

export function normalizeLocale(locale: string | null | undefined): string {
    return locale !== undefined && locale !== null && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

function getCatalog(locale?: string): Catalog {
    return catalogs[normalizeLocale(locale)] ?? {};
}

/**
 * Resolves an i18n key (dot-path, e.g. `errors.gameNotFoundById`) to its translated string,
 * interpolating any `{{param}}` placeholders. Returns the key itself if it is missing from the
 * catalog, so a typo surfaces visibly instead of throwing.
 */
export function t(key: string, params?: TranslationParams, locale?: string | null): string {
    const normalizedLocale = normalizeLocale(locale);
    const template = read(getCatalog(normalizedLocale), key) ?? read(getCatalog(DEFAULT_LOCALE), key);
    if (typeof template !== 'string') {
        return key;
    }
    return params ? interpolate(template, params) : template;
}
