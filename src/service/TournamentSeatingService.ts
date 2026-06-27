import {
    SeatingAlreadyAppliedError,
    SeatingCannotBeModifiedAfterTournamentStartedError,
    SeatingDuplicateParticipantInRoundError,
    SeatingGenerationFailedError,
    SeatingInvalidParticipantError,
    SeatingMissingParticipantsInRoundError,
    SeatingNotEnoughParticipantsError,
    SeatingParticipantsNotMultipleOfTableSizeError,
    SeatingRoundCountMismatchError,
    SeatingSameTeamAtTableError,
    SeatingTableSizeMismatchError,
} from '../error/EventErrors.ts';
import type { Event } from '../model/EventModels.ts';
import { EventFormat } from '../model/EventModels.ts';
import { GameStatus, Wind } from '../model/GameModels.ts';
import type { DetailedGame, TrackedGamePlayerData } from '../model/GameModels.ts';
import { globalLogsTopic } from '../model/TelegramTopic.ts';
import { TournamentStatus } from '../model/TournamentModels.ts';
import { EventRegistrationRepository } from '../repository/EventRegistrationRepository.ts';
import { GameRepository } from '../repository/GameRepository.ts';
import { SeatingGenerationError } from '../util/SeatingGeneratorUtil.ts';
import { runSeatingWorker } from '../util/runSeatingWorker.ts';
import { EventService } from './EventService.ts';
import { GameService } from './GameService.ts';
import LogService from './LogService.ts';
import { TeamService } from './TeamService.ts';
import { TrackedGameService } from './TrackedGameService.ts';

const PLAYERS_PER_TABLE = 4;
/** Seating generation is rare, so we give it a generous budget: at least 5s per candidate. */
const DEFAULT_TIME_PER_CANDIDATE_MS = 5000;
const DEFAULT_CANDIDATE_COUNT = 3;
const MAX_CANDIDATE_COUNT = 5;
const MAX_TIME_LIMIT_MS = 30000;

export interface SeatingGenerateOptions {
    /** Wall-clock budget for generation across all candidates (ms). */
    timeLimitMs?: number | undefined;
    /** How many candidate seatings to return for the moderator to compare. */
    candidateCount?: number | undefined;
    /** Optional seed for reproducible output (defaults to a time-based seed). */
    seed?: number | undefined;
}

/** One seat assignment: a player's user id and their starting wind. */
export interface SeatingSeat {
    userId: number;
    seat: Wind;
}

/** rounds[r][t] = the four seated players (in E/S/W/N order) at table t in round r. */
export interface SeatingCandidateDTO {
    rounds: SeatingSeat[][][];
    tableSpreadScore: number;
    seatBalanceScore: number;
}

export interface SeatingGenerationResultDTO {
    tables: number;
    rounds: number;
    participantCount: number;
    candidates: SeatingCandidateDTO[];
}

/** A chosen seating to persist: rounds of tables, each table four user ids in seat order. */
export type SeatingApplyRounds = number[][][];

export class TournamentSeatingService {
    private eventService: EventService = new EventService();
    private gameService: GameService = new GameService();
    private trackedGameService: TrackedGameService = new TrackedGameService();
    private gameRepository: GameRepository = new GameRepository();
    private registrationRepository: EventRegistrationRepository = new EventRegistrationRepository();
    private teamService: TeamService = new TeamService();

    /**
     * Generate candidate seatings for a tournament using its approved participants and
     * configured round count. Does not persist anything — the moderator picks a candidate
     * and applies it separately. Authorisation matches other tournament-management actions.
     */
    async generateSeating(
        eventId: number,
        options: SeatingGenerateOptions,
        userId: number
    ): Promise<SeatingGenerationResultDTO> {
        const event = this.getTournamentEventForManagement(eventId, userId);
        this.assertTournamentHasNotStarted(event);

        const participantIds = this.getApprovedParticipantIds(eventId);
        const tables = this.resolveTableCount(event, participantIds.length);
        const rounds = event.tournament!.totalRounds;

        // For a team tournament, forbid two players of the same team at a table. The team
        // ids are aligned to the participant index order the generator works in, so the
        // worker can map back. -1 marks an unteamed (e.g. filler) player.
        const playerTeams = event.format === EventFormat.TEAM
            ? this.buildPlayerTeams(eventId, participantIds)
            : undefined;

        const candidateCount = this.resolveCandidateCount(options.candidateCount);
        const timeLimitMs = this.resolveTimeLimit(options.timeLimitMs, candidateCount);
        const seed = options.seed ?? Date.now();

        // Generation is CPU-bound (up to timeLimitMs). Run it in a worker thread so the main
        // event loop stays responsive, and log each attempt with its duration so repeated /
        // abusive requests are visible.
        const startedAt = Date.now();
        let candidates;
        try {
            candidates = await runSeatingWorker({ tables, rounds, timeLimitMs, candidateCount, seed, playerTeams });
        } catch (error) {
            const elapsedMs = Date.now() - startedAt;
            LogService.logInfo(
                `Seating generation FAILED for event ${event.id} ("${event.name}") by user ${userId}: ` +
                    `${tables} tables, ${rounds} rounds, ${candidateCount} candidates, budget ${timeLimitMs}ms, took ${elapsedMs}ms`,
                globalLogsTopic
            );
            if (error instanceof SeatingGenerationError) {
                throw new SeatingGenerationFailedError(event.name);
            }
            throw error;
        }
        const elapsedMs = Date.now() - startedAt;
        LogService.logInfo(
            `Seating generation for event ${event.id} ("${event.name}") by user ${userId}: ` +
                `${tables} tables, ${rounds} rounds, ${candidateCount} candidates, budget ${timeLimitMs}ms, took ${elapsedMs}ms`,
            globalLogsTopic
        );

        return {
            tables,
            rounds,
            participantCount: participantIds.length,
            candidates: candidates.map(candidate => ({
                tableSpreadScore: candidate.tableSpreadScore,
                seatBalanceScore: candidate.seatBalanceScore,
                rounds: candidate.rounds.map(round =>
                    round.map(table =>
                        table.map((playerIndex, seatIndex) => ({
                            userId: participantIds[playerIndex]!,
                            seat: Object.values(Wind)[seatIndex]!,
                        }))
                    )
                ),
            })),
        };
    }

    /**
     * Persist a chosen seating by creating CREATED tournament games, one per table per round.
     * Only allowed before the tournament has started and when no games exist yet — the
     * moderator can clear and regenerate until then. Reuses the tracked-game creation path so
     * the same participant/club validations apply.
     */
    applySeating(eventId: number, seatingRounds: SeatingApplyRounds, userId: number): DetailedGame[] {
        const event = this.getTournamentEventForManagement(eventId, userId);
        this.assertTournamentHasNotStarted(event);
        this.assertNoExistingGames(event);
        this.validateSeatingShape(event, seatingRounds);

        // Atomicity is provided by the route's withTransaction wrapper.
        const createdGames: DetailedGame[] = [];
        const baseTimestamp = new Date();
        let sequence = 0;
        for (let roundIndex = 0; roundIndex < seatingRounds.length; roundIndex++) {
            const round = seatingRounds[roundIndex]!;
            const tournamentRound = roundIndex + 1;
            for (let tableIndex = 0; tableIndex < round.length; tableIndex++) {
                const table = round[tableIndex]!;
                const players: TrackedGamePlayerData[] = table.map((userIdAtSeat, seatIndex) => ({
                    userId: userIdAtSeat,
                    startPlace: Object.values(Wind)[seatIndex]!,
                }));
                const createdAt = new Date(baseTimestamp.getTime() + sequence * 10);
                sequence++;
                const game = this.trackedGameService.createTrackedGame(
                    eventId,
                    players,
                    userId,
                    GameStatus.CREATED,
                    createdAt,
                    tournamentRound,
                    String(tableIndex + 1)
                );
                createdGames.push(game);
            }
        }

        return createdGames;
    }

    /**
     * Delete every game generated for the tournament so a new seating can be produced. Only
     * allowed before the tournament has started.
     */
    clearSeating(eventId: number, userId: number): { deleted: number } {
        const event = this.getTournamentEventForManagement(eventId, userId);
        this.assertTournamentHasNotStarted(event);

        // Atomicity is provided by the route's withTransaction wrapper.
        const games = this.gameRepository.findGamesByEventId(eventId);
        for (const game of games) {
            this.gameService.deleteGame(game.id, userId);
        }

        return { deleted: games.length };
    }

    private getTournamentEventForManagement(eventId: number, userId: number): Event {
        const event = this.eventService.getTournamentEvent(eventId);
        // Reuse the game-creation authorisation (admin / club OWNER or MODERATOR).
        this.gameService.authorizeClubScopedAction(event.clubId, userId, ['OWNER', 'MODERATOR']);
        return event;
    }

    private assertTournamentHasNotStarted(event: Event): void {
        // Seating is editable before the first round starts: CREATED (individual) or
        // DRAFT (team tournament, registration closed and teams being formed).
        const status = event.tournament!.status;
        if (status !== TournamentStatus.CREATED && status !== TournamentStatus.DRAFT) {
            throw new SeatingCannotBeModifiedAfterTournamentStartedError(event.name);
        }
    }

    private assertNoExistingGames(event: Event): void {
        // Require a clean slate: the moderator must clear existing games before re-applying.
        if (event.gameCount > 0) {
            throw new SeatingAlreadyAppliedError(event.name);
        }
    }

    private getApprovedParticipantIds(eventId: number): number[] {
        return this.registrationRepository
            .findRegistrationsByEventIdAndStatus(eventId, 'APPROVED')
            .map(registration => registration.userId);
    }

    /**
     * Team id per participant, aligned to the participantIds index order the seating
     * generator works in. Unteamed participants (e.g. approved fillers not drafted) get
     * -1, which the generator treats as never conflicting.
     */
    private buildPlayerTeams(eventId: number, participantIds: number[]): number[] {
        const teamMap = this.teamService.getPlayerTeamMapForEvent(eventId);
        return participantIds.map(userId => teamMap.get(userId) ?? -1);
    }

    private assertNoSameTeamAtTable(
        event: Event,
        teamMap: Map<number, number>,
        table: number[],
        roundNumber: number,
        tableNumber: number
    ): void {
        const teamsAtTable = new Set<number>();
        for (const userId of table) {
            const teamId = teamMap.get(userId);
            if (teamId === undefined) continue;
            if (teamsAtTable.has(teamId)) {
                throw new SeatingSameTeamAtTableError(event.name, roundNumber, tableNumber);
            }
            teamsAtTable.add(teamId);
        }
    }

    private resolveTableCount(event: Event, participantCount: number): number {
        if (participantCount < PLAYERS_PER_TABLE) {
            throw new SeatingNotEnoughParticipantsError(event.name, PLAYERS_PER_TABLE, participantCount);
        }
        if (participantCount % PLAYERS_PER_TABLE !== 0) {
            throw new SeatingParticipantsNotMultipleOfTableSizeError(event.name, participantCount);
        }
        return participantCount / PLAYERS_PER_TABLE;
    }

    private resolveTimeLimit(requested: number | undefined, candidateCount: number): number {
        return Math.min(
            MAX_TIME_LIMIT_MS,
            Math.max(100, requested !== undefined ? requested : candidateCount * DEFAULT_TIME_PER_CANDIDATE_MS)
        );
    }

    private resolveCandidateCount(requested: number | undefined): number {
        if (requested === undefined) return DEFAULT_CANDIDATE_COUNT;
        return Math.min(Math.max(requested, 1), MAX_CANDIDATE_COUNT);
    }

    private validateSeatingShape(event: Event, seatingRounds: SeatingApplyRounds): void {
        const participantIds = new Set(this.getApprovedParticipantIds(event.id));
        const expectedRounds = event.tournament!.totalRounds;
        // For a team tournament, reject any table that seats two players of the same team.
        const teamMap = event.format === EventFormat.TEAM
            ? this.teamService.getPlayerTeamMapForEvent(event.id)
            : undefined;

        if (seatingRounds.length !== expectedRounds) {
            throw new SeatingRoundCountMismatchError(event.name, expectedRounds, seatingRounds.length);
        }

        for (let roundIndex = 0; roundIndex < seatingRounds.length; roundIndex++) {
            const round = seatingRounds[roundIndex]!;
            const roundNumber = roundIndex + 1;
            const seenInRound = new Set<number>();
            for (let tableIndex = 0; tableIndex < round.length; tableIndex++) {
                const table = round[tableIndex]!;
                if (table.length !== PLAYERS_PER_TABLE) {
                    throw new SeatingTableSizeMismatchError(
                        event.name,
                        roundNumber,
                        tableIndex + 1,
                        PLAYERS_PER_TABLE,
                        table.length
                    );
                }
                for (const userId of table) {
                    if (!participantIds.has(userId)) {
                        throw new SeatingInvalidParticipantError(event.name, userId, roundNumber);
                    }
                    if (seenInRound.has(userId)) {
                        throw new SeatingDuplicateParticipantInRoundError(event.name, userId, roundNumber);
                    }
                    seenInRound.add(userId);
                }
                if (teamMap !== undefined) {
                    this.assertNoSameTeamAtTable(event, teamMap, table, roundNumber, tableIndex + 1);
                }
            }
            if (seenInRound.size !== participantIds.size) {
                throw new SeatingMissingParticipantsInRoundError(
                    event.name,
                    roundNumber,
                    participantIds.size,
                    seenInRound.size
                );
            }
        }
    }
}
