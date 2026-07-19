import {
    type AchievementMetric,
    ACHIEVEMENTS,
    type AchievementDefinition,
    type AchievementValueUnit,
} from '../data/achievementsCatalog.ts';
import type { UserAchievement } from '../model/AchievementModels.ts';
import { AchievementRepository } from '../repository/AchievementRepository.ts';
import type { SupportedLocale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

const DEFINITION_BY_METRIC = new Map<AchievementMetric, AchievementDefinition>(
    ACHIEVEMENTS.map(definition => [definition.metric, definition])
);

/**
 * Assembles the full achievement list shown on a user's profile page. Currently
 * only tournament awards; future work adds event placements, lifetime career/hand
 * achievements, and manually-assigned club awards onto this same seam.
 */
export class ProfileAchievementService {
    private achievementRepository: AchievementRepository = new AchievementRepository();

    getUserAchievements(
        userId: number,
        locale: SupportedLocale,
        recomputeStaleEventAchievements: (eventId: number) => void
    ): UserAchievement[] {
        for (const eventId of this.achievementRepository.findUncomputedTournamentEventIdsForUser(userId)) {
            recomputeStaleEventAchievements(eventId);
        }

        return this.getTournamentAwards(userId, locale);
    }

    private getTournamentAwards(userId: number, locale: SupportedLocale): UserAchievement[] {
        return this.achievementRepository.findByUserId(userId).flatMap(row => {
            const definition = DEFINITION_BY_METRIC.get(row.metric);
            if (definition === undefined) {
                return [];
            }
            const value = row.value ?? undefined;
            return [{
                eventId: row.eventId,
                eventName: row.eventName,
                metric: row.metric,
                name: definition.name,
                description: achievementDescription(definition, locale),
                valueUnit: definition.valueUnit,
                value,
                valueFormatted: formatValue(value, definition.valueUnit, locale),
            }];
        });
    }
}

function achievementDescription(definition: AchievementDefinition, locale: SupportedLocale): string {
    return t(`achievements.descriptions.${definition.metric}`, locale);
}

function formatValue(
    value: number | undefined,
    unit: AchievementValueUnit,
    locale: SupportedLocale
): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    return t(`achievements.units.${unit}`, locale, { value: value.toLocaleString('en-US') });
}
