// Built-in manually-assignable achievements, seeded into every club's catalog.
// `code` is a stable identifier persisted in clubUserAchievement — do not rename.

export interface ManualAchievementDefinition {
    code: string;
    name: string;
    description: string;
}

export const MANUAL_ACHIEVEMENTS: readonly ManualAchievementDefinition[] = [
    {
        code: 'COMMUNITY_BUILDER',
        name: 'Community Builder',
        description: 'Helped grow and strengthen the club community.',
    },
    { code: 'TOURNAMENT_ORGANIZER', name: 'Tournament Organizer', description: 'Organized a club tournament.' },
    { code: 'MENTOR', name: 'Mentor', description: 'Taught and guided newer players.' },
    { code: 'FAIR_PLAY', name: 'Fair Play', description: 'Recognized for sportsmanship and fair play.' },
    {
        code: 'RULES_EXPERT',
        name: 'Rules Expert',
        description: 'Deep knowledge of the rules, always ready to clarify a ruling.',
    },
    {
        code: 'CLUB_AMBASSADOR',
        name: 'Club Ambassador',
        description: 'Represented the club well to outsiders and other clubs.',
    },
    { code: 'EVENT_VOLUNTEER', name: 'Event Volunteer', description: 'Volunteered time to help run a club event.' },
    { code: 'RISING_STAR', name: 'Rising Star', description: 'A newer player showing rapid improvement.' },
    { code: 'IRON_WILL', name: 'Iron Will', description: 'Showed perseverance through a tough run of games.' },
    {
        code: 'HOSPITALITY_HERO',
        name: 'Hospitality Hero',
        description: 'Went out of their way to make others feel welcome.',
    },
] as const;

export const MANUAL_ACHIEVEMENT_BY_CODE = new Map<string, ManualAchievementDefinition>(
    MANUAL_ACHIEVEMENTS.map(definition => [definition.code, definition])
);

export function isManualAchievementCode(code: string): boolean {
    return MANUAL_ACHIEVEMENT_BY_CODE.has(code);
}
