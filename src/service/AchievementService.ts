import { ACHIEVEMENTS, type AchievementDefinition, type AchievementValueUnit } from '../data/achievementsCatalog.ts';
import type { Event } from '../model/EventModels.ts';
import { AchievementCriterion, type EventAchievementResult, type UserAchievement } from '../model/AchievementModels.ts';
import { GameStatus } from '../model/GameModels.ts';
import { AchievementRepository, type EventAchievementWinnerRow } from '../repository/AchievementRepository.ts';
import { GameRepository } from '../repository/GameRepository.ts';
import { type AchievementGame, computeAchievements } from '../util/AchievementCalculator.ts';
import { AchievementsOnlyForTournamentsError } from '../error/EventErrors.ts';
import { EventService } from './EventService.ts';
import LogService from './LogService.ts';
import { type SupportedLocale, t } from '../i18n/index.ts';
import { UserService } from './UserService.ts';
import { resolveUserLocale } from '../util/LocaleResolver.ts';
import { ProfileAchievementService } from './ProfileAchievementService.ts';

export class AchievementService {
    private achievementRepository: AchievementRepository = new AchievementRepository();
    private gameRepository: GameRepository = new GameRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();
    private profileAchievementService: ProfileAchievementService = new ProfileAchievementService();

    /**
     * Recompute and persist a tournament's achievements from its finished games.
     * No-op for non-tournament events. Runs defensively: a calculation error is
     * logged and swallowed so it never blocks the game operation that triggered it.
     */
    recomputeEventAchievements(event: Event): void {
        if (event.type !== 'TOURNAMENT') {
            return;
        }

        try {
            this.computeAndPersist(event);
        } catch (error) {
            LogService.logError(`Failed to compute achievements for event ${event.id}`, error);
        }
    }

    /** Recompute after game changes only when achievements have already been initialized. */
    recomputeEventAchievementsIfAlreadyComputed(event: Event): void {
        if (!this.achievementRepository.areEventAchievementsComputed(event.id)) {
            return;
        }
        this.recomputeEventAchievements(event);
    }

    /**
     * Admin-triggered recompute. Unlike the defensive recompute that runs on game
     * changes, this throws on bad data so the admin sees what went wrong.
     */
    forceRecomputeEventAchievements(eventId: number, requestingUserId: number): EventAchievementResult[] {
        const event = this.eventService.getEventById(eventId);
        if (event.type !== 'TOURNAMENT') {
            throw new AchievementsOnlyForTournamentsError();
        }
        const user = this.userService.getUserById(requestingUserId);
        const locale = resolveUserLocale(user);

        this.computeAndPersist(event);
        return this.buildEventResults(this.achievementRepository.findWinnersByEventId(eventId), locale);
    }

    clearEventAchievements(eventId: number): void {
        const event = this.eventService.getEventById(eventId);
        if (event.type !== 'TOURNAMENT') {
            throw new AchievementsOnlyForTournamentsError();
        }
        this.achievementRepository.clearEventAchievements(eventId);
    }

    private computeAndPersist(event: Event): void {
        const finishedGames = this.gameRepository
            .findGames({ eventId: event.id })
            .filter(game => game.status === GameStatus.FINISHED);

        const games: AchievementGame[] = finishedGames.map(game => ({
            players: this.gameRepository.findGamePlayersByGameId(game.id),
            rounds: this.gameRepository.findGameRoundsByGameId(game.id),
        }));

        const rules = event.gameRules.details?.rules ?? {};
        const achievements = computeAchievements(games, rules);

        const rows = achievements.flatMap(achievement =>
            achievement.winnerUserIds.map(userId => ({
                eventId: event.id,
                metric: achievement.metric,
                userId,
                value: achievement.value ?? null,
            }))
        );

        this.achievementRepository.replaceEventAchievements(event.id, rows, new Date());
    }

    /** Read the stored achievements for the tournament page. */
    getEventAchievements(eventId: number, requestingUserId: number): EventAchievementResult[] {
        this.eventService.getEventById(eventId);
        const user = this.userService.getUserById(requestingUserId);
        const locale = resolveUserLocale(user);

        if (!this.achievementRepository.areEventAchievementsComputed(eventId)) {
            return [];
        }

        return this.buildEventResults(this.achievementRepository.findWinnersByEventId(eventId), locale);
    }

    /** Read a user's stored achievements across all tournaments. */
    getUserAchievements(userId: number, requestingUserId: number): UserAchievement[] {
        const requestingUser = this.userService.getUserById(requestingUserId);
        const locale = resolveUserLocale(requestingUser);

        return this.profileAchievementService.getUserAchievements(
            userId,
            locale,
            eventId => this.recomputeEventAchievements(this.eventService.getEventById(eventId))
        );
    }

    private buildEventResults(
        winnerRows: EventAchievementWinnerRow[],
        locale: SupportedLocale
    ): EventAchievementResult[] {
        return ACHIEVEMENTS.map(definition => {
            const winners = winnerRows.filter(row => row.metric === definition.metric);
            const value = winners[0]?.value ?? undefined;
            return {
                metric: definition.metric,
                name: definition.name,
                description: achievementDescription(definition, locale),
                criterion: definition.criterion,
                valueUnit: definition.valueUnit,
                value,
                valueFormatted: formatValue(value, definition.valueUnit, locale),
                tied: definition.criterion !== AchievementCriterion.AllQualifiers && winners.length > 1,
                winners: winners.map(row => ({
                    userId: row.userId,
                    name: row.name,
                    profileFirstName: row.profileFirstName,
                    profileLastName: row.profileLastName,
                })),
            };
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
