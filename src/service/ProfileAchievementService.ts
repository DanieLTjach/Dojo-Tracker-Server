import {
    type AchievementMetric,
    ACHIEVEMENTS,
    type AchievementDefinition,
    type AchievementValueUnit,
} from '../data/achievementsCatalog.ts';
import { ProfileAchievementType, type UserAchievement } from '../model/AchievementModels.ts';
import { AchievementRepository } from '../repository/AchievementRepository.ts';
import {
    ClubAchievementRepository,
    type ProfileManualAchievementRow,
} from '../repository/ClubAchievementRepository.ts';
import { isManualAchievementCode } from '../data/manualAchievementCatalog.ts';
import type { SupportedLocale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

const DEFINITION_BY_METRIC = new Map<AchievementMetric, AchievementDefinition>(
    ACHIEVEMENTS.map(definition => [definition.metric, definition])
);

/**
 * Assembles the full achievement list shown on a user's profile page. Combines
 * tournament awards and club-issued manual achievements; future work adds event
 * placements and lifetime career/hand achievements onto this same seam. Results
 * are ordered newest-first by award date.
 */
export class ProfileAchievementService {
    private achievementRepository: AchievementRepository = new AchievementRepository();
    private clubAchievementRepository: ClubAchievementRepository = new ClubAchievementRepository();

    getUserAchievements(
        userId: number,
        locale: SupportedLocale,
        recomputeStaleEventAchievements: (eventId: number) => void
    ): UserAchievement[] {
        for (const eventId of this.achievementRepository.findUncomputedTournamentEventIdsForUser(userId)) {
            recomputeStaleEventAchievements(eventId);
        }

        const achievements = [
            ...this.getTournamentAwards(userId, locale),
            ...this.getManualAchievements(userId, locale),
        ];
        return achievements.sort((a, b) => b.awardedAt.getTime() - a.awardedAt.getTime());
    }

    private getTournamentAwards(userId: number, locale: SupportedLocale): UserAchievement[] {
        return this.achievementRepository.findByUserId(userId).flatMap(row => {
            const definition = DEFINITION_BY_METRIC.get(row.metric);
            if (definition === undefined) {
                return [];
            }
            const value = row.value ?? undefined;
            return [{
                type: ProfileAchievementType.TOURNAMENT_AWARD,
                code: definition.metric,
                name: definition.name,
                description: achievementDescription(definition, locale),
                icon: null,
                awardedAt: new Date(row.awardedAt),
                valueUnit: definition.valueUnit,
                value,
                valueFormatted: formatValue(value, definition.valueUnit, locale),
                eventId: row.eventId,
                eventName: row.eventName,
                metric: row.metric,
                clubId: undefined,
                clubName: undefined,
                note: undefined,
            }];
        });
    }

    private getManualAchievements(userId: number, locale: SupportedLocale): UserAchievement[] {
        return this.clubAchievementRepository.findActiveProfileRowsByUserId(userId).map(row =>
            this.buildManualAchievement(row, locale)
        );
    }

    private buildManualAchievement(row: ProfileManualAchievementRow, locale: SupportedLocale): UserAchievement {
        const isBuiltIn = row.builtInCode !== null && isManualAchievementCode(row.builtInCode);
        const name = isBuiltIn
            ? t(`achievements.manual.${row.builtInCode}.name`, locale)
            : row.definitionName!;
        const description = isBuiltIn
            ? t(`achievements.manual.${row.builtInCode}.description`, locale)
            : row.definitionDescription!;

        return {
            type: ProfileAchievementType.MANUAL,
            code: row.builtInCode ?? `custom:${row.definitionId}`,
            name,
            description,
            icon: isBuiltIn ? null : row.definitionIcon,
            awardedAt: new Date(row.awardedAt),
            valueUnit: undefined,
            value: undefined,
            valueFormatted: undefined,
            eventId: undefined,
            eventName: undefined,
            metric: undefined,
            clubId: row.clubId,
            clubName: row.clubName,
            note: row.note ?? undefined,
        };
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
