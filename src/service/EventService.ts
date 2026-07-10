import {
    EventNotFoundError,
    GameRulesNotFoundError,
    CannotDeleteEventWithGamesError,
    CannotDeleteEventWithRegistrationsError,
    CurrentRatingEventMustBeClubScopedError,
    InvalidEventDateRangeError,
    MinParticipantsExceedsMaxError,
    ParticipantConfigOnlyForTournamentError,
    TournamentMustHaveClubError,
    TournamentConfigRequiredError,
    TournamentConfigOnlyForTournamentError,
    EventIsNotTournamentError,
    TournamentTotalRoundsLessThanCurrentRoundError,
    TournamentRoundGamesNotFinishedError,
    TournamentRoundOutOfSequenceError,
    TournamentRoundNotCurrentError,
    TournamentHasNoMoreRoundsError,
    TournamentRoundAlreadyPlayedError,
    TournamentAlreadyFinishedError,
    TournamentNotInLastRoundError,
    TournamentGameNotInCurrentRoundError,
    TournamentMisconfigured,
    InvalidEventFormatForTypeError,
    TeamConfigOnlyForTeamTournamentError,
    TeamConfigRequiredError,
    InvalidTeamSizeError,
    InvalidTeamCountError,
    TeamCountNotDivisibleByFourError,
    MinParticipantsRequiredForTeamConfigError,
    MinParticipantsMustMatchTeamConfigError,
    TournamentRoundNotStartedError,
} from '../error/EventErrors.ts';
import { EventRegistrationRepository } from '../repository/EventRegistrationRepository.ts';
import { ClubNotFoundError, InsufficientClubPermissionsError } from '../error/ClubErrors.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';
import type { Event, EventConfig, EventInfo, EventType } from '../model/EventModels.ts';
import { EventFormat } from '../model/EventModels.ts';
import type { Game } from '../model/GameModels.ts';
import { ClubRole } from '../model/ClubModels.ts';
import { TournamentStatus } from '../model/TournamentModels.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { EventRepository } from '../repository/EventRepository.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { TeamRepository } from '../repository/TeamRepository.ts';
import { UserService } from './UserService.ts';
import { TournamentRepository } from '../repository/TournamentRepository.ts';
import { GameRepository } from '../repository/GameRepository.ts';
import type { EventPatchBody } from '../schema/EventSchemas.ts';
import {
    DraftNotStartableError,
    NotEnoughApprovedForDraftError,
    TeamCountMustBeDivisibleByFourError,
    TeamDraftIncompleteError,
} from '../error/TeamErrors.ts';

export class EventService {
    private eventRepository: EventRepository = new EventRepository();
    private clubRepository: ClubRepository = new ClubRepository();
    private membershipRepository: ClubMembershipRepository = new ClubMembershipRepository();
    private eventRegistrationRepository: EventRegistrationRepository = new EventRegistrationRepository();
    private tournamentRepository: TournamentRepository = new TournamentRepository();
    private gameRepository: GameRepository = new GameRepository();
    private teamRepository: TeamRepository = new TeamRepository();
    private userService: UserService = new UserService();

    getAllEvents(clubId?: number): Event[] {
        if (clubId !== undefined) {
            return this.eventRepository.findAllEventsByClubId(clubId);
        }
        return this.eventRepository.findAllEvents();
    }

    hasEventEnded(event: Event, at: Date = new Date()): boolean {
        return event.dateTo !== null && at > event.dateTo;
    }

    getActiveTournaments(): Event[] {
        return this.getAllEvents()
            .filter(event => event.type === 'TOURNAMENT' && !this.hasEventEnded(event));
    }

    countEventsByGameRulesId(gameRulesId: number): number {
        return this.eventRepository.countEventsByGameRulesId(gameRulesId);
    }

    countGamesByGameRulesId(gameRulesId: number): number {
        return this.eventRepository.countGamesByGameRulesId(gameRulesId);
    }

    getEventById(eventId: number): Event {
        const event = this.eventRepository.findEventById(eventId);
        if (!event) {
            throw new EventNotFoundError(eventId);
        }
        return event;
    }

    validateEventExists(eventId: number): void {
        const event = this.eventRepository.findEventById(eventId);
        if (!event) {
            throw new EventNotFoundError(eventId);
        }
    }

    createEvent(data: EventData, modifiedBy: number): Event {
        this.authorizeEventCreation(data.clubId, modifiedBy);

        if (!this.eventRepository.gameRulesExists(data.gameRulesId)) {
            throw new GameRulesNotFoundError(data.gameRulesId);
        }

        if (data.clubId !== null && data.clubId !== undefined && !this.clubRepository.clubExists(data.clubId)) {
            throw new ClubNotFoundError(data.clubId!);
        }

        this.validateCurrentRatingEvent(data);
        this.validateTournamentClub(data);
        this.validateEventDataInvariants(data);

        const now = new Date();
        const eventId = this.eventRepository.createEvent({
            name: data.name,
            description: data.description ?? null,
            type: data.type,
            format: data.format,
            gameRules: data.gameRulesId,
            clubId: data.clubId ?? null,
            dateFrom: data.dateFrom ?? null,
            dateTo: data.dateTo ?? null,
            startingRating: data.startingRating,
            minimumGamesForRating: data.minimumGamesForRating,
            info: data.info ?? null,
            config: data.config ?? null,
            blockGameCreation: data.blockGameCreation ?? false,
            createdAt: now,
            modifiedAt: now,
            modifiedBy,
        });

        this.syncTournamentConfig(undefined, eventId, data, modifiedBy, now);
        this.syncCurrentRatingEvent(
            undefined,
            data.clubId ?? null,
            data.isCurrentRating ?? false,
            eventId,
            modifiedBy,
            now
        );

        return this.getEventById(eventId);
    }

    updateEvent(eventId: number, data: EventData, modifiedBy: number): Event {
        const existingEvent = this.getEventById(eventId);
        this.authorizeEventUpdate(existingEvent, data.clubId, modifiedBy);

        if (!this.eventRepository.gameRulesExists(data.gameRulesId)) {
            throw new GameRulesNotFoundError(data.gameRulesId);
        }

        if (data.clubId !== null && data.clubId !== undefined && !this.clubRepository.clubExists(data.clubId)) {
            throw new ClubNotFoundError(data.clubId!);
        }

        this.validateCurrentRatingEvent(data);
        this.validateTournamentClub(data);
        this.validateEventDataInvariants(data, existingEvent);

        const now = new Date();
        this.syncCurrentRatingEvent(
            existingEvent,
            data.clubId ?? null,
            data.isCurrentRating ?? false,
            eventId,
            modifiedBy,
            now
        );

        this.eventRepository.updateEvent({
            id: eventId,
            name: data.name,
            description: data.description ?? null,
            type: data.type,
            format: data.format,
            gameRules: data.gameRulesId,
            clubId: data.clubId ?? null,
            dateFrom: data.dateFrom ?? null,
            dateTo: data.dateTo ?? null,
            startingRating: data.startingRating,
            minimumGamesForRating: data.minimumGamesForRating,
            info: data.info ?? null,
            config: data.config ?? null,
            blockGameCreation: data.blockGameCreation ?? false,
            modifiedAt: now,
            modifiedBy,
        });

        this.syncTournamentConfig(existingEvent, eventId, data, modifiedBy, now);

        return this.getEventById(eventId);
    }

    /**
     * Partial update. Projects the existing event into the write-side EventData shape,
     * merges the provided fields over it (info is merged one level deep so a patch that
     * touches only `venue` doesn't wipe `schedule`/`links`), then runs the full
     * `updateEvent` path so all authorization, validation, and sync logic is shared — the
     * merged object is validated exactly as a full PUT would be.
     */
    patchEvent(eventId: number, patch: EventPatchBody, modifiedBy: number): Event {
        const existingEvent = this.getEventById(eventId);
        const merged = mergeEventData(projectEventToData(existingEvent), patch);
        return this.updateEvent(eventId, merged, modifiedBy);
    }

    /**
     * Advance the tournament to `roundId`. Idempotent by design: the caller passes the round
     * it wants to become current, so a duplicated request (double tap, retry on bad network)
     * is a no-op rather than skipping a round.
     *
     * - roundId === currentRound          → no-op (already started).
     * - roundId === (currentRound ?? 0)+1 → start that round.
     * - anything else                     → rejected as out of sequence.
     */
    startTournamentRound(eventId: number, roundId: number, modifiedBy: number): Event {
        const event = this.getTournamentEvent(eventId);
        this.authorizeTournamentManagement(event, modifiedBy);
        const tournament = event.tournament!;

        // Already on the requested round: treat a duplicate request as a successful no-op.
        if (tournament.currentRound === roundId) {
            return event;
        }

        if (tournament.status === TournamentStatus.FINISHED) {
            throw new TournamentAlreadyFinishedError(event.name);
        }

        const nextRound = (tournament.currentRound ?? 0) + 1;
        if (roundId !== nextRound) {
            throw new TournamentRoundOutOfSequenceError(event.name, nextRound, roundId);
        }
        if (nextRound > tournament.totalRounds) {
            throw new TournamentHasNoMoreRoundsError(event.name);
        }
        if (nextRound === 1) {
            this.validateTeamTournamentComposition(event, false);
        }

        if (tournament.currentRound !== null) {
            this.validateTournamentRoundFinished(event, tournament.currentRound);
        }

        const status = nextRound === tournament.totalRounds
            ? TournamentStatus.LAST_ROUND
            : TournamentStatus.IN_PROGRESS;

        this.tournamentRepository.updateTournamentState(eventId, status, nextRound, new Date(), modifiedBy);

        return this.getEventById(eventId);
    }

    /**
     * Cancel (undo) the start of the current tournament round, stepping currentRound back one step.
     * Only the round that is currently active can be cancelled, and only while none of its games have
     * been played yet (all still CREATED) — so we never discard in-progress or finished results.
     *
     * Cancelling round N returns the tournament to round N-1's state (IN_PROGRESS), or to the
     * un-started state (CREATED / currentRound = null) when N was the first round.
     */
    cancelTournamentRound(eventId: number, roundId: number, modifiedBy: number): Event {
        const event = this.getTournamentEvent(eventId);
        this.authorizeTournamentManagement(event, modifiedBy);
        const tournament = event.tournament!;

        if (tournament.status === TournamentStatus.FINISHED) {
            throw new TournamentAlreadyFinishedError(event.name);
        }

        // Only the round that is actually current can be cancelled. A null currentRound (nothing
        // started) or any other round id is rejected.
        if (tournament.currentRound === null) {
            throw new TournamentRoundNotStartedError(event.name, roundId);
        }
        if (tournament.currentRound !== roundId) {
            throw new TournamentRoundNotCurrentError(event.name, tournament.currentRound, roundId);
        }

        this.validateTournamentRoundNotStarted(event, roundId);

        const previousRound = roundId - 1;
        const newCurrentRound = previousRound >= 1 ? previousRound : null;
        // Stepping back before round 1 returns to the pre-start state: DRAFT for a
        // team tournament (teams already formed, registration closed) or CREATED
        // for an individual tournament.
        const preStartStatus = event.format === EventFormat.INDIVIDUAL
            ? TournamentStatus.CREATED
            : TournamentStatus.DRAFT;
        const newStatus = newCurrentRound === null ? preStartStatus : TournamentStatus.IN_PROGRESS;

        this.tournamentRepository.updateTournamentState(eventId, newStatus, newCurrentRound, new Date(), modifiedBy);

        return this.getEventById(eventId);
    }

    finishTournament(eventId: number, modifiedBy: number): Event {
        const event = this.getTournamentEvent(eventId);
        this.authorizeTournamentManagement(event, modifiedBy);
        const tournament = event.tournament!;

        if (tournament.status === TournamentStatus.FINISHED) {
            throw new TournamentAlreadyFinishedError(event.name);
        }

        if (tournament.currentRound !== tournament.totalRounds) {
            throw new TournamentNotInLastRoundError(event.name);
        }

        this.validateTournamentRoundFinished(event, tournament.currentRound);

        this.tournamentRepository.updateTournamentState(
            eventId,
            TournamentStatus.FINISHED,
            tournament.currentRound,
            new Date(),
            modifiedBy
        );

        return this.getEventById(eventId);
    }

    validateTournamentGameCanStart(event: Event, game: Game): void {
        if (event.type !== 'TOURNAMENT') {
            return;
        }

        if (event.tournament === null || game.tournamentRound !== event.tournament.currentRound) {
            throw new TournamentGameNotInCurrentRoundError(
                event.tournament?.currentRound ?? null,
                game.tournamentRound
            );
        }
    }

    private authorizeEventCreation(clubId: number | null | undefined, userId: number): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (clubId === null || clubId === undefined) {
            throw new InsufficientPermissionsError();
        }

        const clubRole = this.membershipRepository.getUserClubRole(clubId, userId);
        if (clubRole !== 'OWNER') {
            throw new InsufficientClubPermissionsError('OWNER');
        }
    }

    private authorizeEventUpdate(
        existingEvent: Event,
        requestedClubId: number | null | undefined,
        userId: number
    ): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (existingEvent.clubId === null) {
            throw new InsufficientPermissionsError();
        }

        const clubRole = this.membershipRepository.getUserClubRole(existingEvent.clubId, userId);
        if (clubRole !== 'OWNER') {
            throw new InsufficientClubPermissionsError('OWNER');
        }

        if (requestedClubId !== existingEvent.clubId) {
            throw new InsufficientPermissionsError();
        }
    }

    deleteEvent(eventId: number, modifiedBy: number): void {
        const event = this.getEventById(eventId);
        this.authorizeEventDeletion(event, modifiedBy);

        const gameCount = this.eventRepository.getGameCountForEvent(eventId);
        if (gameCount > 0) {
            throw new CannotDeleteEventWithGamesError(event.name, gameCount);
        }

        const registrationCount = this.eventRegistrationRepository.countRegistrationsByEventId(eventId);
        if (registrationCount > 0) {
            throw new CannotDeleteEventWithRegistrationsError(event.name, registrationCount);
        }

        if (event.isCurrentRating && event.clubId !== null) {
            this.clubRepository.updateCurrentRatingEvent(event.clubId, null, new Date(), modifiedBy);
        }

        if (event.tournament !== null) {
            this.tournamentRepository.deleteTournament(eventId);
        }
        this.eventRepository.deleteEvent(eventId);
    }

    private authorizeEventDeletion(event: Event, userId: number): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (event.clubId === null) {
            throw new InsufficientPermissionsError();
        }

        const clubRole = this.membershipRepository.getUserClubRole(event.clubId, userId);
        if (clubRole !== 'OWNER') {
            throw new InsufficientClubPermissionsError('OWNER');
        }
    }

    private validateTournamentClub(data: EventData): void {
        if (data.type === 'TOURNAMENT' && (data.clubId === null || data.clubId === undefined)) {
            throw new TournamentMustHaveClubError();
        }
    }

    getTournamentEvent(eventId: number): Event {
        const event = this.getEventById(eventId);
        if (event.type !== 'TOURNAMENT') {
            throw new EventIsNotTournamentError(event.name);
        }
        if (event.tournament === null) {
            throw new TournamentMisconfigured();
        }
        return event;
    }

    startDraft(eventId: number, modifiedBy: number): Event {
        const event = this.getTournamentEvent(eventId);
        this.authorizeTournamentManagement(event, modifiedBy);
        if (event.format !== EventFormat.TEAM) {
            throw new InvalidEventFormatForTypeError(event.type, event.format);
        }
        if (event.tournament!.status !== TournamentStatus.CREATED) {
            throw new DraftNotStartableError(event.name);
        }

        const required = this.requiredDraftMinimum(event);
        const approved = this.eventRegistrationRepository.countApprovedByEventId(eventId);
        if (approved < required) {
            throw new NotEnoughApprovedForDraftError(event.name, required, approved);
        }

        return this.setTournamentStatus(eventId, TournamentStatus.DRAFT, modifiedBy);
    }

    private setTournamentStatus(eventId: number, status: TournamentStatus, modifiedBy: number): Event {
        const event = this.getTournamentEvent(eventId);
        this.tournamentRepository.updateTournamentState(
            eventId,
            status,
            event.tournament!.currentRound,
            new Date(),
            modifiedBy
        );
        return this.getEventById(eventId);
    }

    private authorizeTournamentManagement(event: Event, userId: number): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (event.clubId === null) {
            throw new InsufficientPermissionsError();
        }

        const role = this.membershipRepository.getUserClubRole(event.clubId, userId);
        if (role !== ClubRole.OWNER && role !== ClubRole.MODERATOR) {
            throw new InsufficientClubPermissionsError([ClubRole.OWNER, ClubRole.MODERATOR]);
        }
    }

    validateTeamTournamentComposition(event: Event, requireTeamCountDivisibleByFour: boolean): void {
        if (event.format !== EventFormat.TEAM) {
            return;
        }

        // A team tournament is ready when the drafted teams fill the configured
        // shape: exactly teamCount teams, each with exactly teamSize members.
        // Approved players who were not drafted are treated as reserves — they do
        // not block the start, so an organizer may approve more players than fit.
        const { teamSize, teamCount } = event.config?.teamConfig ?? { teamSize: 0, teamCount: 0 };
        const teamMemberCounts = this.teamRepository.findTeamMemberCountsByEventId(event.id);

        const draftMatchesConfig = teamMemberCounts.length === teamCount &&
            teamMemberCounts.every(team => team.memberCount === teamSize);
        if (!draftMatchesConfig) {
            throw new TeamDraftIncompleteError(event.name, teamCount, teamSize);
        }

        if (requireTeamCountDivisibleByFour && teamMemberCounts.length % 4 !== 0) {
            throw new TeamCountMustBeDivisibleByFourError(event.name, teamMemberCounts.length);
        }
    }

    private validateTournamentRoundFinished(event: Event, round: number): void {
        const unfinishedCount = this.gameRepository.countUnfinishedGamesByEventAndTournamentRound(event.id, round);
        if (unfinishedCount > 0) {
            throw new TournamentRoundGamesNotFinishedError(event.name, round, unfinishedCount);
        }
    }

    private validateTournamentRoundNotStarted(event: Event, round: number): void {
        const startedCount = this.gameRepository.countStartedGamesByEventAndTournamentRound(event.id, round);
        if (startedCount > 0) {
            throw new TournamentRoundAlreadyPlayedError(event.name, round, startedCount);
        }
    }

    private validateTournamentConfig(data: EventData, existingEvent?: Event): void {
        if (data.type === 'TOURNAMENT') {
            if (data.tournament === null || data.tournament === undefined) {
                throw new TournamentConfigRequiredError();
            }
            this.validateTotalRoundsNotLessThanCurrentRound(
                data.tournament.totalRounds,
                existingEvent?.tournament?.currentRound ?? null
            );
            return;
        }

        if (data.tournament !== null && data.tournament !== undefined) {
            throw new TournamentConfigOnlyForTournamentError();
        }
    }

    private validateTotalRoundsNotLessThanCurrentRound(totalRounds: number, currentRound: number | null): void {
        if (currentRound !== null && totalRounds < currentRound) {
            throw new TournamentTotalRoundsLessThanCurrentRoundError(totalRounds, currentRound);
        }
    }

    /**
     * Cross-field invariants that previously lived only in the `eventSchema` zod refine.
     * Lifted here so they also guard the PATCH path (which merges then writes without
     * re-running the full create/update zod refinements). PUT keeps the zod refine too as
     * defense in depth; this guard makes the rules apply uniformly.
     */
    private validateEventDataInvariants(data: EventData, existingEvent?: Event): void {
        this.validateTournamentConfig(data, existingEvent);
        this.validateEventFormat(data);

        if (data.dateFrom && data.dateTo && data.dateFrom >= data.dateTo) {
            throw new InvalidEventDateRangeError();
        }

        const minParticipants = data.config?.minParticipants;
        const maxParticipants = data.config?.maxParticipants;
        const registrationDeadline = data.config?.registrationDeadline;

        if (
            data.type !== 'TOURNAMENT' &&
            (minParticipants !== undefined || maxParticipants !== undefined || registrationDeadline !== undefined)
        ) {
            throw new ParticipantConfigOnlyForTournamentError();
        }

        if (
            minParticipants !== undefined &&
            maxParticipants !== undefined &&
            minParticipants > maxParticipants
        ) {
            throw new MinParticipantsExceedsMaxError();
        }
    }

    /**
     * Validates the event format against its type and, for TEAM tournaments, the
     * teamConfig sizing. v1 supports TEAM only for tournaments (HYBRID is reserved
     * for future team seasons and rejected here). teamConfig is required for TEAM
     * tournaments and forbidden otherwise; it must satisfy:
     *   teamCount % 4 === 0  (a table seats one player from four distinct teams), and
     *   minParticipants === teamSize * teamCount  (the draft minimum reuses minParticipants).
     */
    private validateEventFormat(data: EventData): void {
        const format = data.format;
        const allowed = this.allowedFormatsForType(data.type);
        if (!allowed.includes(format)) {
            throw new InvalidEventFormatForTypeError(data.type, format);
        }

        const isTeamTournament = data.type === 'TOURNAMENT' && format === EventFormat.TEAM;
        const teamConfig = data.config?.teamConfig;

        if (!isTeamTournament) {
            if (teamConfig !== undefined) {
                throw new TeamConfigOnlyForTeamTournamentError();
            }
            return;
        }

        if (teamConfig === undefined) {
            throw new TeamConfigRequiredError();
        }
        if (!Number.isInteger(teamConfig.teamSize) || teamConfig.teamSize < 1) {
            throw new InvalidTeamSizeError();
        }
        if (!Number.isInteger(teamConfig.teamCount) || teamConfig.teamCount < 1) {
            throw new InvalidTeamCountError();
        }
        if (teamConfig.teamCount % 4 !== 0) {
            throw new TeamCountNotDivisibleByFourError();
        }
        const minParticipants = data.config?.minParticipants;
        const expected = teamConfig.teamSize * teamConfig.teamCount;
        if (minParticipants === undefined) {
            throw new MinParticipantsRequiredForTeamConfigError(expected);
        }
        if (minParticipants !== expected) {
            throw new MinParticipantsMustMatchTeamConfigError(minParticipants, expected);
        }
    }

    private allowedFormatsForType(type: EventType): EventFormat[] {
        // v1: TEAM only for tournaments; seasons stay INDIVIDUAL (team seasons / HYBRID later).
        return type === 'TOURNAMENT'
            ? [EventFormat.INDIVIDUAL, EventFormat.TEAM]
            : [EventFormat.INDIVIDUAL];
    }

    private requiredDraftMinimum(event: Event): number {
        const config = event.config;
        if (config?.minParticipants !== undefined) {
            return config.minParticipants;
        }
        const teamConfig = config?.teamConfig;
        return teamConfig !== undefined ? teamConfig.teamSize * teamConfig.teamCount : 0;
    }

    private validateCurrentRatingEvent(data: EventData): void {
        if (!data.isCurrentRating) {
            return;
        }

        if (data.clubId === null || data.clubId === undefined) {
            throw new CurrentRatingEventMustBeClubScopedError();
        }
    }

    private syncCurrentRatingEvent(
        existingEvent: Event | undefined,
        newClubId: number | null,
        newIsCurrentRating: boolean,
        eventId: number,
        modifiedBy: number,
        modifiedAt: Date
    ): void {
        if (existingEvent?.isCurrentRating && existingEvent.clubId !== null) {
            this.clubRepository.updateCurrentRatingEvent(existingEvent.clubId, null, modifiedAt, modifiedBy);
        }

        if (newIsCurrentRating && newClubId !== null) {
            this.clubRepository.updateCurrentRatingEvent(newClubId, eventId, modifiedAt, modifiedBy);
        }
    }

    private syncTournamentConfig(
        existingEvent: Event | undefined,
        eventId: number,
        data: EventData,
        modifiedBy: number,
        modifiedAt: Date
    ): void {
        if (data.type === 'TOURNAMENT') {
            if (existingEvent === undefined || existingEvent.tournament === null) {
                this.tournamentRepository.createTournament(
                    eventId,
                    data.tournament!.totalRounds,
                    modifiedAt,
                    modifiedBy
                );
                return;
            }

            this.tournamentRepository.updateTournamentTotalRounds(
                eventId,
                data.tournament!.totalRounds,
                modifiedAt,
                modifiedBy
            );
            return;
        }

        if (existingEvent?.tournament !== null && existingEvent?.tournament !== undefined) {
            this.tournamentRepository.deleteTournament(eventId);
        }
    }
}

// Project a stored Event (read shape) into the write-side EventData. The two
// shapes differ: Event holds the full `gameRules` object and a rich `tournament`
// row, while EventData wants `gameRulesId` and a minimal `{ totalRounds }`. This
// projection is the base a PATCH merges onto.
export function projectEventToData(event: Event): EventData {
    const base: EventData = {
        name: event.name,
        description: event.description,
        type: event.type,
        format: event.format,
        clubId: event.clubId,
        isCurrentRating: event.isCurrentRating,
        dateFrom: event.dateFrom,
        dateTo: event.dateTo,
        gameRulesId: event.gameRules.id,
        startingRating: event.startingRating,
        minimumGamesForRating: event.minimumGamesForRating,
        info: event.info,
        config: event.config,
        blockGameCreation: event.blockGameCreation,
    };
    if (event.tournament !== null) {
        base.tournament = { totalRounds: event.tournament.totalRounds };
    }
    return base;
}

// Merge a partial patch over a base EventData. Only keys present in the patch
// override the base; JSON objects are merged one level deep so patching one
// sub-key preserves its siblings.
export function mergeEventData(base: EventData, patch: EventPatchBody): EventData {
    const merged: EventData = { ...base };
    assignIfPresent(merged, patch, 'name');
    assignIfPresent(merged, patch, 'description');
    assignIfPresent(merged, patch, 'type');
    assignIfPresent(merged, patch, 'format');
    assignIfPresent(merged, patch, 'isCurrentRating');
    assignIfPresent(merged, patch, 'dateFrom');
    assignIfPresent(merged, patch, 'dateTo');
    assignIfPresent(merged, patch, 'clubId');
    assignIfPresent(merged, patch, 'gameRulesId');
    assignIfPresent(merged, patch, 'startingRating');
    assignIfPresent(merged, patch, 'minimumGamesForRating');
    assignIfPresent(merged, patch, 'blockGameCreation');
    assignIfPresent(merged, patch, 'tournament');
    if ('info' in patch) {
        merged.info = mergeEventInfo(base.info ?? null, patch.info ?? null);
    }
    if ('config' in patch) {
        merged.config = mergeEventConfig(base.config ?? null, patch.config ?? null);
    }
    return merged;
}

// Copy `key` from patch to target only when the patch actually carries it. The
// shared key names between EventPatchBody and EventData make this type-safe.
function assignIfPresent<K extends keyof EventPatchBody & keyof EventData>(
    target: EventData,
    patch: EventPatchBody,
    key: K
): void {
    if (key in patch) {
        target[key] = patch[key] as EventData[K];
    }
}

// One-level-deep merge of the event `info` JSON column. A `null` patch clears
// info entirely; otherwise each provided sub-key replaces the base sub-key while
// untouched sub-keys are carried forward.
function mergeEventInfo(base: EventInfo | null, patch: EventInfo | null): EventInfo | null {
    if (patch === null) {
        return null;
    }
    if (base === null) {
        return patch;
    }
    return { ...base, ...patch };
}

function mergeEventConfig(
    base: EventConfig | null,
    patch: NonNullable<EventPatchBody['config']> | null
): EventConfig | null {
    if (patch === null) {
        return null;
    }

    const merged: Partial<Record<keyof EventConfig, EventConfig[keyof EventConfig]>> = { ...base };
    for (const key of Object.keys(patch) as Array<keyof EventConfig>) {
        const value = patch[key];
        if (value === null) {
            delete merged[key];
        } else if (value !== undefined) {
            merged[key] = value;
        }
    }

    return Object.keys(merged).length > 0 ? merged as EventConfig : null;
}

export interface TournamentData {
    totalRounds: number;
}

export interface EventData {
    name: string;
    description?: string | null | undefined;
    type: EventType;
    format: EventFormat;
    clubId?: number | null | undefined;
    isCurrentRating?: boolean | null | undefined;
    dateFrom?: Date | null | undefined;
    dateTo?: Date | null | undefined;
    gameRulesId: number;
    startingRating: number;
    minimumGamesForRating: number;
    info?: EventInfo | null | undefined;
    config?: EventConfig | null | undefined;
    blockGameCreation?: boolean | undefined;
    tournament?: TournamentData | null | undefined;
}
