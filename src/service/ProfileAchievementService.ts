import {
    type AchievementMetric,
    ACHIEVEMENTS,
    achievementDescription,
    achievementName,
    type AchievementDefinition,
    formatValue,
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

import { dbManager } from '../db/dbInit.ts';
import type { ComputedAchievementState } from '../util/AutomaticAchievementEvaluator.ts';
import type { GamePlayer } from '../model/GameModels.ts';
import type { GameAchievementUnlock } from '../model/AchievementModels.ts';
import {
    getAutomaticAchievementIconUrl,
    getAutomaticAchievementImageUrl,
} from '../data/automaticAchievementCatalog.ts';

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
        return achievements.sort((a, b) => (b.awardedAt?.getTime() ?? 0) - (a.awardedAt?.getTime() ?? 0));
    }

    getPublicUserAchievement(
        userId: number,
        code: string,
        locale: SupportedLocale
    ): UserAchievement | null {
        const state = this.automaticAchievementRepository.findUnlockedStateByUserIdAndCode(userId, code);
        if (state) {
            const def = AUTOMATIC_ACHIEVEMENTS_BY_CODE.get(state.code);
            if (def) {
                const eventName = state.sourceEventId != null
                    ? this.resolveEventNames([state.sourceEventId]).get(state.sourceEventId)
                    : undefined;
                return this.buildAutomaticAchievement(state, locale, false, eventName);
            }
        }

        const manualAchievements = this.getManualAchievements(userId, locale);
        const manualMatch = manualAchievements.find(a => a.code === code && a.awardedAt);
        if (manualMatch) {
            return manualMatch;
        }

        const tournamentAwards = this.getTournamentAwards(userId, locale);
        const tournamentMatch = tournamentAwards.find(a => a.code === code && a.awardedAt);
        if (tournamentMatch) {
            return tournamentMatch;
        }

        return null;
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

    private resolveEventNames(eventIds: (number | null | undefined)[]): Map<number, string> {
        const validIds = Array.from(new Set(eventIds.filter((id): id is number => id != null)));
        if (validIds.length === 0) {
            return new Map();
        }
        const placeholders = validIds.map(() => '?').join(',');
        const rows = dbManager.db.prepare(`
            SELECT id, name FROM event WHERE id IN (${placeholders})
        `).all(...validIds) as Array<{ id: number, name: string }>;
        return new Map(rows.map(r => [r.id, r.name]));
    }

    buildAutomaticAchievement(
        row: ComputedAchievementState,
        locale: SupportedLocale,
        isProgress: boolean = false,
        eventName?: string
    ): UserAchievement {
        const def = AUTOMATIC_ACHIEVEMENTS_BY_CODE.get(row.code);
        const name = def ? t(`achievements.automatic.${row.code}.name`, locale) : row.code;
        const description = def ? t(`achievements.automatic.${row.code}.description`, locale) : '';
        const value = row.value ?? undefined;
        const valueFormatted = value !== undefined && def?.valueUnit !== undefined
            ? formatValue(value, def.valueUnit, locale)
            : undefined;

        const base: UserAchievement = {
            type: ProfileAchievementType.AUTOMATIC,
            code: row.code,
            category: def?.category,
            scopeType: def?.scopeType,
            name,
            description,
            icon: def ? (def.icon ?? getAutomaticAchievementIconUrl(def.code)) : null,
            imageUrl: def ? getAutomaticAchievementImageUrl(def.code) : null,
            valueUnit: def?.valueUnit,
            value,
            valueFormatted,
            eventId: row.sourceEventId ?? undefined,
            eventName: eventName ?? undefined,
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
        };

        if (isProgress) {
            base.updatedAt = (row as any).computedAt ? new Date((row as any).computedAt) : new Date();
        } else {
            base.awardedAt = row.unlockedAt ? new Date(row.unlockedAt) : new Date();
        }

        return base;
    }

    private getAutomaticAchievements(userId: number, locale: SupportedLocale): UserAchievement[] {
        const rows = this.automaticAchievementRepository.findUnlockedStatesByUserId(userId);
        const eventNames = this.resolveEventNames(rows.map(r => r.sourceEventId));
        return rows.flatMap(row => {
            const def = AUTOMATIC_ACHIEVEMENTS_BY_CODE.get(row.code);
            if (def === undefined) return [];
            const eventName = row.sourceEventId != null ? eventNames.get(row.sourceEventId) : undefined;
            return [this.buildAutomaticAchievement(row, locale, false, eventName)];
        });
    }

    private getAutomaticProgress(userId: number, locale: SupportedLocale): UserAchievement[] {
        const rows = this.automaticAchievementRepository.findProgressStatesByUserId(userId);
        const eventNames = this.resolveEventNames(rows.map(r => r.sourceEventId));
        return rows.flatMap(row => {
            const def = AUTOMATIC_ACHIEVEMENTS_BY_CODE.get(row.code);
            if (def === undefined) return [];
            const eventName = row.sourceEventId != null ? eventNames.get(row.sourceEventId) : undefined;
            return [this.buildAutomaticAchievement(row, locale, true, eventName)];
        });
    }

    getGameAchievementUnlocks(
        gameId: number,
        players: GamePlayer[],
        locale: SupportedLocale
    ): GameAchievementUnlock[] {
        const unlockedStates = this.automaticAchievementRepository.findUnlockedStatesBySourceGameId(gameId);
        if (unlockedStates.length === 0) return [];

        const eventNames = this.resolveEventNames(unlockedStates.map(s => s.sourceEventId));

        const statesByUser = new Map<number, ComputedAchievementState[]>();
        for (const s of unlockedStates) {
            let list = statesByUser.get(s.userId);
            if (list === undefined) {
                list = [];
                statesByUser.set(s.userId, list);
            }
            list.push(s);
        }

        const unlocks: GameAchievementUnlock[] = [];
        for (const p of players) {
            const userStates = statesByUser.get(p.userId);
            if (userStates && userStates.length > 0) {
                unlocks.push({
                    user: {
                        id: p.userId,
                        name: p.name,
                        profileFirstName: p.profileFirstName,
                        profileLastName: p.profileLastName,
                    },
                    achievements: userStates.map(s => {
                        const eventName = s.sourceEventId != null ? eventNames.get(s.sourceEventId) : undefined;
                        return this.buildAutomaticAchievement(s, locale, false, eventName);
                    }),
                });
            }
        }
        return unlocks;
    }

    getEventLifetimeUnlocks(
        eventId: number,
        locale: SupportedLocale
    ): GameAchievementUnlock[] {
        const unlockedStates = this.automaticAchievementRepository
            .findUnlockedStatesBySourceEventId(eventId)
            .filter(s => s.sourceRoundNumber != null);
        if (unlockedStates.length === 0) return [];

        const eventName = this.resolveEventNames([eventId]).get(eventId);

        const statesByUser = new Map<number, ComputedAchievementState[]>();
        for (const s of unlockedStates) {
            let list = statesByUser.get(s.userId);
            if (list === undefined) {
                list = [];
                statesByUser.set(s.userId, list);
            }
            list.push(s);
        }

        const userIds = Array.from(statesByUser.keys());
        if (userIds.length === 0) return [];

        const placeholders = userIds.map(() => '?').join(',');
        const users = dbManager.db.prepare(`
            SELECT u.id, u.name, p.firstName AS profileFirstName, p.lastName AS profileLastName
            FROM user u
            LEFT JOIN profile p ON u.id = p.userId
            WHERE u.id IN (${placeholders})
        `).all(...userIds) as Array<{
            id: number;
            name: string;
            profileFirstName: string | null;
            profileLastName: string | null;
        }>;
        const userMap = new Map(users.map(u => [u.id, u]));

        const unlocks: GameAchievementUnlock[] = [];
        for (const [uid, uStates] of statesByUser.entries()) {
            const u = userMap.get(uid);
            unlocks.push({
                user: {
                    id: uid,
                    name: u ? u.name : `User ${uid}`,
                    profileFirstName: u ? u.profileFirstName : null,
                    profileLastName: u ? u.profileLastName : null,
                },
                achievements: uStates.map(s => this.buildAutomaticAchievement(s, locale, false, eventName)),
            });
        }
        return unlocks;
    }

    private getAutomaticCoverage(userId: number): UserAchievementCoverage {
        const unlockedStates = this.automaticAchievementRepository.findUnlockedStatesByUserId(userId);
        const unlockedCodes = new Set(unlockedStates.map(s => s.code));
        const unlockedCount = unlockedCodes.size;
        const totalCount = AUTOMATIC_ACHIEVEMENTS.length;

        // First production reads of trackedOnly/gameSize: a code only counts
        // toward the denominator when this user can ever unlock it. Sanma-only
        // codes need a sanma game; trackedOnly codes need a game with recorded
        // rounds.
        const playedSanma = this.automaticAchievementRepository.hasUserPlayedGameSize(userId, 3);
        const hasTrackedGames = this.automaticAchievementRepository.hasUserPlayedTrackedGame(userId);
        let eligibleCount = 0;
        for (const def of AUTOMATIC_ACHIEVEMENTS) {
            if (def.gameSize === 3 && !playedSanma) continue;
            if (def.trackedOnly && !hasTrackedGames) continue;
            eligibleCount += 1;
        }

        const percentage = eligibleCount > 0 ? Math.round((unlockedCount / eligibleCount) * 10000) / 100 : 0;

        return {
            unlockedCount,
            totalCount,
            eligibleCount,
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
                name: achievementName(definition, locale),
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
            assignmentId: row.id,
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
