import {
    type AchievementMetric,
    ACHIEVEMENTS,
    type AchievementDefinition,
    type AchievementValueUnit,
} from '../data/achievementsCatalog.ts';
import type { Event } from '../model/EventModels.ts';
import { AchievementCriterion, type EventAchievementResult, type UserAchievement } from '../model/AchievementModels.ts';
import { type DetailedGame, GameStatus } from '../model/GameModels.ts';
import { AchievementRepository, type EventAchievementWinnerRow } from '../repository/AchievementRepository.ts';
import { GameRepository } from '../repository/GameRepository.ts';
import { computeAchievements } from '../util/AchievementCalculator.ts';
import { AchievementsOnlyForTournamentsError } from '../error/EventErrors.ts';
import { TournamentStatus } from '../model/TournamentModels.ts';
import { EventService } from './EventService.ts';
import LogService from './LogService.ts';
import { type SupportedLocale, t } from '../i18n/index.ts';
import { UserService } from './UserService.ts';
import { resolveUserLocale } from '../util/LocaleResolver.ts';

const DEFINITION_BY_METRIC = new Map<AchievementMetric, AchievementDefinition>(
    ACHIEVEMENTS.map(definition => [definition.metric, definition])
);

export class AchievementService {
    private achievementRepository: AchievementRepository = new AchievementRepository();
    private gameRepository: GameRepository = new GameRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();

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

    /**
     * Recompute only when the tournament is already finished. Achievements are derived from a
     * tournament's final results, so there is no point recomputing them on every game action
     * (creation/update/deletion) while the tournament is still running — only a change to a
     * finished tournament's games can affect its achievements.
     */
    recomputeEventAchievementsIfTournamentFinished(event: Event): void {
        if (event.tournament?.status !== TournamentStatus.FINISHED) {
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

    private computeAndPersist(event: Event): void {
        const finishedGames = this.gameRepository
            .findGames({ eventId: event.id })
            .filter(game => game.status === GameStatus.FINISHED);

        const games: DetailedGame[] = finishedGames.map(game => ({
            ...game,
            players: this.gameRepository.findGamePlayersByGameId(game.id),
            rounds: this.gameRepository.findGameRoundsByGameId(game.id),
            currentState: null,
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

    /** Achievements for the tournament page. Computes lazily on first read for historical tournaments. */
    getEventAchievements(eventId: number, requestingUserId: number): EventAchievementResult[] {
        const event = this.eventService.getEventById(eventId);
        const user = this.userService.getUserById(requestingUserId);
        const locale = resolveUserLocale(user);

        if (!this.achievementRepository.areEventAchievementsComputed(eventId)) {
            this.recomputeEventAchievements(event);
        }

        return this.buildEventResults(this.achievementRepository.findWinnersByEventId(eventId), locale);
    }

    /** Achievements a user has won across all tournaments, for the profile page. */
    getUserAchievements(userId: number, requestingUserId: number): UserAchievement[] {
        for (const eventId of this.achievementRepository.findUncomputedTournamentEventIdsForUser(userId)) {
            this.recomputeEventAchievements(this.eventService.getEventById(eventId));
        }

        const requestingUser = this.userService.getUserById(requestingUserId);
        const locale = resolveUserLocale(requestingUser);

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
