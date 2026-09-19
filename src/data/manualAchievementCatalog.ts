import type { SupportedLocale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

export const MANUAL_ACHIEVEMENT_CODES = [
    'COMMUNITY_BUILDER',
    'TOURNAMENT_ORGANIZER',
    'MENTOR',
    'FAIR_PLAY',
    'RULES_EXPERT',
    'CLUB_AMBASSADOR',
    'EVENT_VOLUNTEER',
    'RISING_STAR',
    'IRON_WILL',
    'HOSPITALITY_HERO',
] as const;

export type ManualAchievementCode = typeof MANUAL_ACHIEVEMENT_CODES[number];

const MANUAL_ACHIEVEMENT_CODE_SET = new Set<string>(MANUAL_ACHIEVEMENT_CODES);

export function isManualAchievementCode(code: string): code is ManualAchievementCode {
    return MANUAL_ACHIEVEMENT_CODE_SET.has(code);
}

export function getManualCatalog(locale: SupportedLocale) {
    return MANUAL_ACHIEVEMENT_CODES.map(code => ({
        code,
        name: t(`achievements.manual.${code}.name`, locale),
        description: t(`achievements.manual.${code}.description`, locale),
    }));
}
