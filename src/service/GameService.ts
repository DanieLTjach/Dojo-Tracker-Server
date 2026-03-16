import { GameRepository } from '../repository/GameRepository.ts';
import { UserService } from '../service/UserService.ts';
import {
    GameNotFoundById,
    IncorrectPlayerCountError,
    DuplicatePlayerError,
    TooManyGamesFoundError,
    IncorrectTotalPointsError,
    EventHasntStartedError,
    EventHasEndedError,
    DuplicateGameTimestampInEventError,
    YouHaveToBeAdminToCreateGameWithCustomTime,
    PointsNotWithinRange,
    YouHaveToBeAdminToHideNewGameMessage
} from '../error/GameErrors.ts';
import type { GameWithPlayers, PlayerData, GameFilters, GamePlayer } from '../model/GameModels.ts';
import { EventService } from './EventService.ts';
import type { Event, GameRules } from '../model/EventModels.ts';
import { RatingService } from './RatingService.ts';
import LogService from './LogService.ts';
import dedent from 'dedent';
import type { User } from '../model/UserModels.ts';
import config from '../../config/config.ts';
import { GameLogsTopic, RatingTopic } from '../model/TelegramTopic.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { MembershipRepository } from '../repository/MembershipRepository.ts';
import { InsufficientClubPermissionsError } from '../error/ClubErrors.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';
import type { ClubRole } from '../model/ClubModels.ts';

export class GameService {

    private gameRepository: GameRepository = new GameRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();
    private ratingService: RatingService = new RatingService();
    private clubRepository: ClubRepository = new ClubRepository();
    private membershipRepository: MembershipRepository = new MembershipRepository();

    addGame(
        eventId: number,
        playersData: PlayerData[],
        createdBy: number,
        createdAt: Date | undefined,
        hideNewGameMessage: boolean,
        tournamentHanchanNumber: number | null,
        tournamentTableNumber: number | null
    ): GameWithPlayers {
        const gameTimestamp = createdAt ?? new Date();
        if (createdAt !== undefined) {
            this.userService.validateUserIsAdmin(createdBy, () => new YouHaveToBeAdminToCreateGameWithCustomTime());
        }
        if (hideNewGameMessage !== false) {
            this.userService.validateUserIsAdmin(createdBy, () => new YouHaveToBeAdminToHideNewGameMessage());
        }

        const event = this.eventService.getEventById(eventId);
        this.authorizeGameCreation(event, playersData, createdBy);
        this.validatePlayers(playersData, event.gameRules);
        this.validateGameWithinEventDates(event, gameTimestamp, createdBy);
        this.validateNoDuplicateGameTimestamp(eventId, gameTimestamp);

        const standingsBefore = this.ratingService.calculateStandings(eventId);

        const newGameId = this.gameRepository.createGame(eventId, createdBy, gameTimestamp, tournamentHanchanNumber, tournamentTableNumber);
        this.addPlayersToGame(newGameId, playersData, createdBy);
        this.ratingService.addRatingChangesFromGame(newGameId, gameTimestamp, playersData, eventId, event.gameRules);

        const standingsAfter = this.ratingService.calculateStandings(eventId);

        const newGame = this.getGameById(newGameId);
        this.logNewGame(newGame, event);
        if (!hideNewGameMessage) {
            this.logRatingUpdateForGame(newGame, event, standingsBefore, standingsAfter, createdBy);
        }
        return newGame;
    }

    getGameById(gameId: number): GameWithPlayers {
        const game = this.gameRepository.findGameById(gameId);
        if (!game) {
            throw new GameNotFoundById(gameId);
        }

        return {
            ...game,
            players: this.gameRepository.findGamePlayersByGameId(gameId)
        };
    }

    getGames(filters: GameFilters): GameWithPlayers[] {
        this.validateGameFilters(filters);

        const games = this.gameRepository.findGames(filters);

        if (games.length > 100) {
            throw new TooManyGamesFoundError();
        }

        const gamePlayers = this.gameRepository.findGamePlayersByGameIds(games.map(g => g.id));

        return games.map(game => ({
            ...game,
            players: gamePlayers.filter(gp => gp.gameId === game.id)
        }));
    }

    updateGame(
        gameId: number,
        eventId: number,
        playersData: PlayerData[],
        modifiedBy: number,
        createdAt: Date | undefined,
        tournamentHanchanNumber: number | null,
        tournamentTableNumber: number | null
    ): GameWithPlayers {
        const oldGame = this.getGameById(gameId);
        const oldEvent = this.eventService.getEventById(oldGame.eventId);
        this.authorizeClubScopedAction(oldEvent.clubId, modifiedBy, ['OWNER', 'MODERATOR']);

        const event = this.eventService.getEventById(eventId);
        this.validatePlayers(playersData, event.gameRules);

        const newGameTimestamp = createdAt ?? oldGame.createdAt;

        this.gameRepository.updateGame(gameId, eventId, modifiedBy, newGameTimestamp, tournamentHanchanNumber, tournamentTableNumber);
        this.gameRepository.deleteGamePlayersByGameId(gameId);
        this.addPlayersToGame(gameId, playersData, modifiedBy);

        this.ratingService.deleteRatingChangesFromGame(oldGame);
        this.ratingService.addRatingChangesFromGame(gameId, newGameTimestamp, playersData, eventId, event.gameRules);

        const updatedGame = this.getGameById(gameId);
        this.logEditedGame(oldGame, updatedGame, event, modifiedBy);
        return updatedGame;
    }

    deleteGame(gameId: number, deletedBy: number): void {
        const game = this.getGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);
        this.authorizeClubScopedAction(event.clubId, deletedBy, ['OWNER']);

        this.ratingService.deleteRatingChangesFromGame(game);

        this.gameRepository.deleteGamePlayersByGameId(gameId);
        this.gameRepository.deleteGameById(gameId);

        this.logDeletedGame(game, event, deletedBy);
    }

    private authorizeGameCreation(event: Event, playersData: PlayerData[], createdBy: number): void {
        const user = this.userService.getUserById(createdBy);
        if (user.isAdmin || event.clubId === null) {
            return;
        }

        if (!this.clubHasActiveMemberships(event.clubId)) {
            return;
        }

        const creatorRole = this.membershipRepository.getUserClubRole(event.clubId, createdBy);
        if (!creatorRole) {
            throw new InsufficientClubPermissionsError(['OWNER', 'MODERATOR', 'MEMBER']);
        }

        if (creatorRole === 'MEMBER') {
            const allPlayersInClub = playersData.every((player) => this.membershipRepository.getUserClubRole(event.clubId!, player.userId) !== undefined);
            if (!allPlayersInClub) {
                throw new InsufficientClubPermissionsError(['OWNER', 'MODERATOR', 'MEMBER']);
            }
        }
    }

    private authorizeClubScopedAction(clubId: number | null, userId: number, allowedRoles: ClubRole[]): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (clubId === null) {
            throw new InsufficientPermissionsError();
        }

        const role = this.membershipRepository.getUserClubRole(clubId, userId);
        if (!this.clubHasActiveMemberships(clubId)) {
            throw new InsufficientPermissionsError();
        }

        if (role === undefined || !allowedRoles.includes(role)) {
            throw new InsufficientClubPermissionsError(allowedRoles);
        }
    }

    private clubHasActiveMemberships(clubId: number): boolean {
        return this.membershipRepository.findMembersByClubId(clubId).some((membership) => membership.status === 'ACTIVE');
    }

    private logNewGame(game: GameWithPlayers, event: Event): void {
        const clubPrefix = this.buildClubPrefix(event);
        this.logGameAction(game, event, game.modifiedBy, '🎮 New Game Added', 'Created by', clubPrefix);
    }

    private logEditedGame(oldGame: GameWithPlayers, newGame: GameWithPlayers, event: Event, modifiedBy: number): void {
        const user = this.userService.getUserById(modifiedBy);

        const oldEvent = this.eventService.getEventById(oldGame.eventId);
        const message = dedent`
            <b>✏️ Game Edited</b>

            <b>Game ID:</b> <code>${newGame.id}</code>
            <b>Event:</b> ${oldEvent.name} <code>(ID: ${oldEvent.id})</code> → ${event.name} <code>(ID: ${event.id})</code>
            <b>Timestamp:</b> <code>${oldGame.createdAt.toISOString()}</code> → <code>${newGame.createdAt.toISOString()}</code>
            <b>Edited by:</b> ${user.name} <code>(ID: ${user.id})</code>

            <b>Players (Before):</b>\n
        ` + this.printPlayersLog(oldGame.players) + dedent`
            \n\n<b>Players (After):</b>\n
        ` + this.printPlayersLog(newGame.players);
        LogService.logInfo(message, GameLogsTopic);
    }

    private logDeletedGame(game: GameWithPlayers, event: Event, deletedBy: number): void {
        this.logGameAction(game, event, deletedBy, '🗑️ Game Deleted', 'Deleted by');
    }

    private logGameAction(
        game: GameWithPlayers,
        event: Event,
        userId: number,
        title: string,
        userLabel: string,
        prefix: string = ''
    ): void {
        const user = this.userService.getUserById(userId);
        const message = prefix + dedent`
            <b>${title}</b>

            <b>Game ID:</b> <code>${game.id}</code>
            <b>Event:</b> ${event.name} <code>(ID: ${event.id})</code>
            <b>Timestamp:</b> <code>${game.createdAt.toISOString()}</code>
            <b>${userLabel}:</b> ${user.name} <code>(ID: ${user.id})</code>

            <b>Players:</b>\n
        ` + this.printPlayersLog(game.players);
        LogService.logInfo(message, GameLogsTopic);
    }

    private printPlayersLog(players: GamePlayer[]): string {
        return players.map((p, index) => {
            const user = this.userService.getUserById(p.userId);
            const ratingSign = p.ratingChange >= 0 ? '+' : '';

            let userDescription = `${index + 1}. <b>${user.name}</b> <code>(ID: ${user.id})</code>`;
            userDescription += `\n   • Points: <b>${p.points}</b>`;
            if (p.startPlace !== null) {
                userDescription += `\n   • Start Place: <b>${p.startPlace}</b>`;
            }
            if (p.chomboCount > 0) {
                userDescription += `\n   • Chombo Count: <b>${p.chomboCount}</b>`;
            }
            userDescription += `\n   • Rating: <b>${ratingSign}${p.ratingChange}</b>`;
            return userDescription;
        }).join('\n\n');
    }

    private logRatingUpdateForGame(
        game: GameWithPlayers,
        event: Event,
        standingsBefore: Map<number, number>,
        standingsAfter: Map<number, number>,
        createdBy: number
    ): void {
        // Sort players by points descending (as they were ranked in the game)
        const sortedPlayers = [...game.players].sort((a, b) => b.points - a.points);

        const maxPlayerPointsStringLength = Math.max(...sortedPlayers.map(p => p.points.toString().length));
        const maxPlayerRatingChangeStringLength = Math.max(
            ...sortedPlayers.map(p => this.signedNumberToString(p.ratingChange).length)
        );
        const padding = Math.max(maxPlayerPointsStringLength, maxPlayerRatingChangeStringLength) + 1;

        const playerLines = sortedPlayers.map((player, index) => {
            const user = this.userService.getUserById(player.userId);
            const standingBefore = standingsBefore.get(player.userId) ?? NaN;
            const standingAfter = standingsAfter.get(player.userId) ?? NaN;

            let standingString = '';
            if (standingAfter < standingBefore) {
                standingString = `↗️ (${standingBefore} → ${standingAfter})`;
            } else if (standingAfter > standingBefore) {
                standingString = `↘️ (${standingBefore} → ${standingAfter})`;
            } else if (standingAfter === standingBefore) {
                standingString = `⏺️ (${standingBefore})`;
            } else if (Number.isNaN(standingBefore) && !Number.isNaN(standingAfter)) {
                standingString = `🆕 (${standingAfter})`;
            }

            return `<code>${index + 1}.${player.points.toString().padStart(padding, ' ')}</code>`
                + ` | ${this.generateUserProfileLink(user)}\n`
                + `<code>${this.signedNumberToString(player.ratingChange).padStart(padding + 2, ' ')}</code>`
                + (standingString ? ` | ${standingString}` : '');
        }).join('\n\n');

        const createdByUser = this.userService.getUserById(createdBy);
        const clubPrefix = this.buildClubPrefix(event);
        const message = clubPrefix + `<a href="${config.botUrl}?startapp=event_${event.id}"><b>${event.name}</b></a>`
            + `\nДодано <a href="${config.botUrl}?startapp=game_${game.id}">нову гру</a>`
            + ` користувачем ${this.generateUserProfileLink(createdByUser)}\n\n`
            + `${playerLines}`;

        LogService.logInfo(message, RatingTopic);
    }

    private signedNumberToString(num: number): string {
        return num >= 0 ? `+${num}` : `${num}`;
    }

    private generateUserProfileLink(user: User): string {
        return `<a href="${config.botUrl}?startapp=user_${user.id}"><b>${user.name}</b></a>`;
    }

    private buildClubPrefix(event: Event): string {
        if (event.clubId === null) {
            return '';
        }

        const club = this.clubRepository.findClubById(event.clubId);
        if (club === undefined) {
            return '';
        }

        return `[${club.name}] `;
    }

    private validateGameFilters(filters: GameFilters): void {
        if (filters?.userId !== undefined) {
            this.userService.validateUserExistsById(filters.userId);
        }
        if (filters?.eventId !== undefined) {
            this.eventService.validateEventExists(filters.eventId);
        }
    }

    private validatePlayers(playersData: PlayerData[], gameRules: GameRules): void {
        if (playersData.length !== gameRules.numberOfPlayers) {
            throw new IncorrectPlayerCountError(gameRules.numberOfPlayers);
        }

        for (const playerData of playersData) {
            this.userService.validateUserIsActiveById(playerData.userId);
        }

        this.validateNoDuplicatePlayers(playersData);
        this.validateTotalPoints(playersData, gameRules);
        this.validatePoints(playersData);
    }

    private addPlayersToGame(gameId: number, players: PlayerData[], modifiedBy: number): void {
        for (const player of players) {
            this.gameRepository.addGamePlayer(
                gameId,
                player.userId,
                player.points,
                player.startPlace ?? undefined,
                player.chomboCount ?? 0,
                modifiedBy
            );
        }
    }

    private validateNoDuplicatePlayers(players: PlayerData[]): void {
        const userIds = players.map(p => p.userId);
        const uniqueUserIds = new Set(userIds);

        if (uniqueUserIds.size !== userIds.length) {
            const seen = new Set<number>();
            for (const player of players) {
                if (seen.has(player.userId)) {
                    const user = this.userService.getUserById(player.userId);
                    throw new DuplicatePlayerError(user.name);
                }
                seen.add(player.userId);
            }
        }
    }

    private validateTotalPoints(playersData: PlayerData[], gameRules: GameRules): void {
        const totalPoints = playersData.reduce((sum, player) => sum + player.points, 0);
        const expectedTotal = gameRules.numberOfPlayers * gameRules.startingPoints;

        if (totalPoints !== expectedTotal) {
            throw new IncorrectTotalPointsError(expectedTotal, totalPoints);
        }
    }

    private validatePoints(playersData: PlayerData[]): void {
        for (const player of playersData) {
            if (Math.abs(player.points) > MAX_POINTS) {
                throw new PointsNotWithinRange(player.points, -MAX_POINTS, MAX_POINTS);
            }
        }
    }

    private validateGameWithinEventDates(event: Event, gameTimestamp: Date, createdBy: number): void {
        if (event.dateFrom !== null && gameTimestamp < event.dateFrom) {
            throw new EventHasntStartedError(event.name);
        }
        if (event.dateTo !== null && gameTimestamp > event.dateTo) {
            const user = this.userService.getUserById(createdBy);
            if (!user.isAdmin) {
                throw new EventHasEndedError(event.name);
            }
        }
    }

    // rating calculation relies on unique game timestamps within an event
    private validateNoDuplicateGameTimestamp(eventId: number, timestamp: Date): void {
        const existingGame = this.gameRepository.findGameByEventAndTimestamp(eventId, timestamp);
        if (existingGame !== undefined) {
            throw new DuplicateGameTimestampInEventError();
        }
    }
}

const MAX_POINTS = 1_000_000;
