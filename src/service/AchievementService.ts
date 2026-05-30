import { ACHIEVEMENTS, type AchievementDefinition, type AchievementValueUnit } from '../data/achievementsCatalog.ts';
import type { Event } from '../model/EventModels.ts';
import type { EventAchievementResult, UserAchievement } from '../model/AchievementModels.ts';
import { GameStatus } from '../model/GameModels.ts';
import { AchievementRepository, type EventAchievementWinnerRow } from '../repository/AchievementRepository.ts';
import { GameRepository } from '../repository/GameRepository.ts';
import { RatingRepository } from '../repository/RatingRepository.ts';
import { computeAchievements, type AchievementGameInput } from '../util/AchievementCalculator.ts';
import { getSubstitutePlayerPenaltyBeforeUma, isManganRoundingUpEnabled } from '../util/RulesUtils.ts';
import { EventService } from './EventService.ts';
import LogService from './LogService.ts';

const DEFINITION_BY_METRIC = new Map<string, AchievementDefinition>(
    ACHIEVEMENTS.map((definition) => [definition.metric, definition])
);

export class AchievementService {
    private achievementRepository: AchievementRepository = new AchievementRepository();
    private gameRepository: GameRepository = new GameRepository();
    private ratingRepository: RatingRepository = new RatingRepository();
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
            const finishedGames = this.gameRepository
                .findGames({ eventId: event.id })
                .filter((game) => game.status === GameStatus.FINISHED);

            const zeroRatingChangesByGame = this.ratingRepository.findZeroRatingChangesByEvent(event.id);

            const inputs: AchievementGameInput[] = finishedGames.map((game) => ({
                players: this.gameRepository.findGamePlayersByGameId(game.id).map((player) => ({
                    userId: player.userId,
                    points: player.points,
                    startPlace: player.startPlace,
                    isSubstitutePlayer: player.isSubstitutePlayer,
                    chomboCount: player.chomboCount
                })),
                rounds: this.gameRepository.findGameRoundsByGameId(game.id).map((round) => ({
                    dealerNumber: round.dealerNumber,
                    result: round.result
                })),
                zeroRatingChangeUserIds: zeroRatingChangesByGame.get(game.id) ?? []
            }));

            const rules = event.gameRules.details?.rules ?? {};
            const computed = computeAchievements(
                inputs,
                isManganRoundingUpEnabled(rules),
                getSubstitutePlayerPenaltyBeforeUma(rules)
            );

            const rows = computed.flatMap((achievement) =>
                achievement.winnerUserIds.map((userId) => ({
                    eventId: event.id,
                    metric: achievement.metric,
                    userId,
                    value: achievement.value
                }))
            );

            this.achievementRepository.replaceEventAchievements(event.id, rows, new Date());
        } catch (error) {
            LogService.logError(`Failed to compute achievements for event ${event.id}`, error);
        }
    }

    /** Achievements for the tournament page. Computes lazily on first read for historical tournaments. */
    getEventAchievements(eventId: number): EventAchievementResult[] {
        const event = this.eventService.getEventById(eventId);

        if (!this.achievementRepository.isEventComputed(eventId)) {
            this.recomputeEventAchievements(event);
        }

        return this.buildEventResults(this.achievementRepository.findWinnersByEventId(eventId));
    }

    /** Achievements a user has won across all tournaments, for the profile page. */
    getUserAchievements(userId: number): UserAchievement[] {
        for (const eventId of this.achievementRepository.findUncomputedTournamentEventIdsForUser(userId)) {
            this.recomputeEventAchievements(this.eventService.getEventById(eventId));
        }

        return this.achievementRepository.findByUserId(userId).flatMap((row) => {
            const definition = DEFINITION_BY_METRIC.get(row.metric);
            if (definition === undefined) {
                return [];
            }
            return [{
                eventId: row.eventId,
                eventName: row.eventName,
                metric: row.metric,
                name: definition.name,
                description: definition.description,
                valueUnit: definition.valueUnit,
                value: row.value,
                valueFormatted: formatValue(row.value, definition.valueUnit)
            }];
        });
    }

    private buildEventResults(winnerRows: EventAchievementWinnerRow[]): EventAchievementResult[] {
        return ACHIEVEMENTS.map((definition) => {
            const winners = winnerRows.filter((row) => row.metric === definition.metric);
            const value = winners[0]?.value ?? 0;
            return {
                metric: definition.metric,
                name: definition.name,
                description: definition.description,
                criterion: criterionOf(definition),
                valueUnit: definition.valueUnit,
                value,
                valueFormatted: formatValue(value, definition.valueUnit),
                tied: !definition.listAllQualifiers && winners.length > 1,
                winners: winners.map((row) => ({
                    userId: row.userId,
                    name: row.name,
                    profileFirstName: row.profileFirstName,
                    profileLastName: row.profileLastName
                }))
            };
        });
    }
}

function criterionOf(definition: AchievementDefinition): EventAchievementResult['criterion'] {
    if (definition.listAllQualifiers) {
        return 'all-qualifiers';
    }
    return definition.higherIsBetter ? 'highest' : 'lowest';
}

function formatValue(value: number, unit: AchievementValueUnit): string {
    return `${value.toLocaleString('en-US')} ${unit}`;
}
