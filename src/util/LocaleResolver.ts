import type { Request } from 'express';
import { DEFAULT_LOCALE, normalizeLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../i18n/index.ts';
import type { Club } from '../model/ClubModels.ts';
import type { User } from '../model/UserModels.ts';

export function resolveUserLocale(user: User): SupportedLocale {
    return normalizeLocale(user.profile?.locale);
}

/**
 * Resolves API response text for the language the caller is displaying now.
 * A request header takes precedence over the saved preference so changing the
 * app language applies immediately, without requiring a profile write first.
 */
export function resolveRequestLocale(req: Request, user?: User): SupportedLocale {
    if (req.get('Accept-Language')) {
        const locale = req.acceptsLanguages(...SUPPORTED_LOCALES);
        if (locale) {
            return locale as SupportedLocale;
        }
    }
    return user ? resolveUserLocale(user) : DEFAULT_LOCALE;
}

export function resolveClubLocale(club: Club): SupportedLocale {
    return normalizeLocale(club.locale);
}
