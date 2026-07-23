// Built-in manually-assignable achievements, seeded into every club's catalog.
// `code` is a stable identifier persisted in clubUserAchievement — do not rename.
// Display name/description are resolved via i18n (achievements.manual.<code>.*), not stored here.

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
