import {
    type AchievementMetric,
    ACHIEVEMENTS,
    type AchievementDefinition,
    type AchievementValueUnit,
} from '../data/achievementsCatalog.ts';
import {
    AUTOMATIC_ACHIEVEMENTS,
    AUTOMATIC_ACHIEVEMENTS_BY_CODE,
} from '../data/automaticAchievementCatalog.ts';
import {
    ProfileAchievementType,
    type UserAchievement,
    type UserAchievementCoverage,
} from '../model/AchievementModels.ts';
import { AchievementRepository } from '../repository/AchievementRepository.ts';
import {
    ClubAchievementRepository,
    type ProfileManualAchievementRow,
} from '../repository/ClubAchievementRepository.ts';
import { AutomaticAchievementRepository } from '../repository/AutomaticAchievementRepository.ts';
import { isManualAchievementCode } from '../data/manualAchievementCatalog.ts';
import type { SupportedLocale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

const DEFINITION_BY_METRIC = new Map<AchievementMetric, AchievementDefinition>(
    ACHIEVEMENTS.map(definition => [definition.metric, definition])
);

/**
 * Assembles the full achievement list shown on a user's profile page. Combines
 * tournament awards, club-issued manual achievements, and lifetime automatic achievements.
 * Results are ordered newest-first by award date.
 */
export class ProfileAchievementService {
    private achievementRepository: AchievementRepository = new AchievementRepository();
    private clubAchievementRepository: ClubAchievementRepository = new ClubAchievementRepository();
    private automaticAchievementRepository: AutomaticAchievementRepository = new AutomaticAchievementRepository();

    getUserAchievements(
        userId: number,
        locale: SupportedLocale
    ): UserAchievement[] {
        const achievements = [
            ...this.getTournamentAwards(userId, locale),
            ...this.getManualAchievements(userId, locale),
            ...this.getAutomaticAchievements(userId, locale),
        ];
        return achievements.sort((a, b) => b.awardedAt.getTime() - a.awardedAt.getTime());
    }

    getUserProfileAchievementsResponse(
        userId: number,
        locale: SupportedLocale
    ): {
        achievements: UserAchievement[];
        progress: UserAchievement[];
        coverage: UserAchievementCoverage;
    } {
        const achievements = this.getUserAchievements(userId, locale);
        const progress = this.getAutomaticProgress(userId, locale);
        const coverage = this.getAutomaticCoverage(userId);

        return {
            achievements,
            progress,
            coverage,
        };
    }

    private getAutomaticAchievements(userId: number, locale: SupportedLocale): UserAchievement[] {
        const rows = this.automaticAchievementRepository.findUnlockedStatesByUserId(userId);
        return rows.flatMap(row => {
            const def = AUTOMATIC_ACHIEVEMENTS_BY_CODE.get(row.code);
            if (def === undefined) return [];

            const name = t(`achievements.automatic.${row.code}.name`, locale);
            const description = t(`achievements.automatic.${row.code}.description`, locale);
            const value = row.value ?? undefined;
            const valueFormatted = value !== undefined && def.valueUnit !== undefined
                ? formatValue(value, def.valueUnit, locale)
                : undefined;

            return [{
                type: ProfileAchievementType.AUTOMATIC,
                code: row.code,
                name,
                description,
                icon: def.icon ?? null,
                awardedAt: new Date(row.unlockedAt!),
                valueUnit: def.valueUnit,
                value,
                valueFormatted,
                eventId: row.sourceEventId ?? undefined,
                eventName: undefined,
                metric: undefined,
                clubId: undefined,
                clubName: undefined,
                note: undefined,
                scope: row.scope,
                progress: row.progress,
                target: row.target,
                evidence: {
                    sourceEventId: row.sourceEventId ?? null,
                    sourceGameId: row.sourceGameId ?? null,
                    sourceRoundNumber: row.sourceRoundNumber ?? null,
                },
            }];
        });
    }

    private getAutomaticProgress(userId: number, locale: SupportedLocale): UserAchievement[] {
        const rows = this.automaticAchievementRepository.findProgressStatesByUserId(userId);
        return rows.flatMap(row => {
            const def = AUTOMATIC_ACHIEVEMENTS_BY_CODE.get(row.code);
            if (def === undefined) return [];

            const name = t(`achievements.automatic.${row.code}.name`, locale);
            const description = t(`achievements.automatic.${row.code}.description`, locale);
            const value = row.value ?? undefined;
            const valueFormatted = value !== undefined && def.valueUnit !== undefined
                ? formatValue(value, def.valueUnit, locale)
                : undefined;

            return [{
                type: ProfileAchievementType.AUTOMATIC,
                code: row.code,
                name,
                description,
                icon: def.icon ?? null,
                awardedAt: new Date(row.computedAt),
                valueUnit: def.valueUnit,
                value,
                valueFormatted,
                eventId: row.sourceEventId ?? undefined,
                eventName: undefined,
                metric: undefined,
                clubId: undefined,
                clubName: undefined,
                note: undefined,
                scope: row.scope,
                progress: row.progress,
                target: row.target,
                evidence: {
                    sourceEventId: row.sourceEventId ?? null,
                    sourceGameId: row.sourceGameId ?? null,
                    sourceRoundNumber: row.sourceRoundNumber ?? null,
                },
            }];
        });
    }

    private getAutomaticCoverage(userId: number): UserAchievementCoverage {
        const unlockedStates = this.automaticAchievementRepository.findUnlockedStatesByUserId(userId);
        const unlockedCodes = new Set(unlockedStates.map(s => s.code));
        const unlockedCount = unlockedCodes.size;
        const totalCount = AUTOMATIC_ACHIEVEMENTS.length;
        const percentage = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 10000) / 100 : 0;

        return {
            unlockedCount,
            totalCount,
            percentage,
        };
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
