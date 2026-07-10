import { normalizeLocale, SupportedLocale } from '../i18n/index.ts';
import type { Club } from '../model/ClubModels.ts';
import type { User } from '../model/UserModels.ts';

export function resolveUserLocale(user: User): SupportedLocale {
    return normalizeLocale(user.profile?.locale);
}

export function resolveClubLocale(club: Club): SupportedLocale {
    return normalizeLocale(club.locale);
}
