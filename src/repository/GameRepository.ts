import type { Statement } from 'better-sqlite3';
import type { Game, GameFilters, GamePlayer, GameRound, GameState, GameStatus } from '../model/GameModels.ts';
import type { GameRoundResult, PlayerPointChange } from '../model/GameRoundResultModels.ts';
import { dbManager } from '../db/dbInit.ts';
import { RATING_TO_POINTS_COEFFICIENT } from '../service/RatingService.ts';
import { parseGameStatus, parseWind } from '../util/EnumUtil.ts';
import { booleanToInteger } from '../db/dbUtils.ts';

export class GameRepository {

    private createGameStatement(): Statement<{
        eventId: number,
        modifiedBy: number,
        timestamp: string,
        tournamentRound: number | null,
        tournamentTable: string | null
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO game (eventId, modifiedBy, createdAt, modifiedAt, tournamentRound, tournamentTable, status, startedAt, endedAt)
            VALUES (:eventId, :modifiedBy, :timestamp, :timestamp, :tournamentRound, :tournamentTable, 'FINISHED', :timestamp, :timestamp)`
        );
    }

    createGame(eventId: number, modifiedBy: number, timestamp: Date, tournamentRound: number | null, tournamentTable: string | null): number {
        return Number(
            this.createGameStatement().run({
                eventId,
                modifiedBy,
                timestamp: timestamp.toISOString(),
                tournamentRound,
                tournamentTable
            }).lastInsertRowid
        );
    }

    private createTrackedGameStatement(): Statement<{
        eventId: number,
        modifiedBy: number,
        timestamp: string,
        tournamentRound: number | null,
        tournamentTable: string | null,
        status: GameStatus,
        startedAt: string | null
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO game (eventId, modifiedBy, createdAt, modifiedAt, tournamentRound, tournamentTable, status, startedAt, endedAt, lastRoundWasDeleted)
            VALUES (:eventId, :modifiedBy, :timestamp, :timestamp, :tournamentRound, :tournamentTable, :status, :startedAt, NULL, 0)`
        );
    }

    createTrackedGame(
        eventId: number,
        modifiedBy: number,
        timestamp: Date,
        status: GameStatus,
        tournamentRound: number | undefined,
        tournamentTable: string | undefined
    ): number {
        const timestampStr = timestamp.toISOString();

        return Number(
            this.createTrackedGameStatement().run({
                eventId,
                modifiedBy,
                timestamp: timestampStr,
                tournamentRound: tournamentRound ?? null,
                tournamentTable: tournamentTable ?? null,
                status,
                startedAt: status === "CREATED" ? null : timestampStr
            }).lastInsertRowid
        );
    }

    private addGamePlayerStatement(): Statement<{
        gameId: number,
        userId: number,
        points: number,
        startPlace: string | undefined,
        chomboCount: number,
        modifiedBy: number,
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO userToGame (gameId, userId, points, startPlace, chomboCount, modifiedBy, createdAt, modifiedAt)
            VALUES (:gameId, :userId, :points, :startPlace, :chomboCount, :modifiedBy, :timestamp, :timestamp)`
        );
    }

    addGamePlayer(
        gameId: number,
        userId: number,
        points: number,
        startPlace: string | undefined,
        chomboCount: number,
        modifiedBy: number
    ): void {
        this.addGamePlayerStatement().run({
            gameId,
            userId,
            points,
            startPlace,
            chomboCount,
            modifiedBy,
            timestamp: new Date().toISOString()
        });
    }

    private findGameByIdStatement(): Statement<{ id: number }, GameDBEntity> {
        return dbManager.db.prepare('SELECT * FROM game WHERE id = :id');
    }

    findGameById(gameId: number): Game | undefined {
        const gameDBEntity = this.findGameByIdStatement().get({ id: gameId });
        return gameDBEntity !== undefined ? gameFromDBEntity(gameDBEntity) : undefined;
    }

    private findGamePlayersByGameIdStatement(): Statement<{ gameId: number }, GamePlayerDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                u.name,
                u.telegramUsername,
                p.firstName AS profileFirstName,
                p.lastName AS profileLastName,
                p.hideProfile AS profileHidden,
                utg.*,
                COALESCE(urc.ratingChange, 0) AS ratingChange
            FROM userToGame utg
            JOIN user u ON utg.userId = u.id
            LEFT JOIN profile p ON p.userId = utg.userId
            LEFT JOIN userRatingChange urc ON urc.userId = utg.userId AND urc.gameId = utg.gameId
            WHERE utg.gameId = :gameId
            ORDER BY points DESC, userId`
        );
    }

    findGamePlayersByGameId(gameId: number): GamePlayer[] {
        return this.findGamePlayersByGameIdStatement().all({ gameId }).map(gamePlayerFromDBEntity);
    }

    private findGameRoundsByGameIdStatement(): Statement<{ gameId: number }, GameRoundDBEntity> {
        return dbManager.db.prepare(`
            SELECT gameId, roundNumber, wind, dealerNumber, counters, riichiSticks, result
            FROM gameRound
            WHERE gameId = :gameId
            ORDER BY roundNumber`
        );
    }

    findGameRoundsByGameId(gameId: number): GameRound[] {
        return this.findGameRoundsByGameIdStatement().all({ gameId }).map(gameRoundFromDBEntity);
    }

    private createGameRoundStatement(): Statement<{
        gameId: number,
        roundNumber: number,
        wind: string,
        dealerNumber: number,
        counters: number,
        riichiSticks: number,
        result: string
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO gameRound (gameId, roundNumber, wind, dealerNumber,counters, riichiSticks, result)
            VALUES (:gameId, :roundNumber, :wind, :dealerNumber, :counters, :riichiSticks, :result)`
        );
    }

    createGameRound(
        gameId: number,
        roundNumber: number,
        roundState: GameState,
        result: GameRoundResult
    ): void {
        this.createGameRoundStatement().run({
            gameId,
            roundNumber,
            wind: roundState.wind,
            dealerNumber: roundState.dealerNumber,
            counters: roundState.counters,
            riichiSticks: roundState.riichiSticks,
            result: JSON.stringify(result)
        });
    }

    private updateGameRoundResultStatement(): Statement<{
        gameId: number,
        roundNumber: number,
        result: string
    }, void> {
        return dbManager.db.prepare(`
            UPDATE gameRound
            SET result = :result
            WHERE gameId = :gameId AND roundNumber = :roundNumber`
        );
    }

    updateGameRoundResult(gameId: number, roundNumber: number, result: GameRoundResult): void {
        this.updateGameRoundResultStatement().run({
            gameId,
            roundNumber,
            result: JSON.stringify(result)
        });
    }

    private updatePlayerPointsStatement(): Statement<{
        gameId: number,
        userId: number,
        pointChange: number,
        modifiedBy: number,
        modifiedAt: string
    }, void> {
        return dbManager.db.prepare(`
            UPDATE userToGame
            SET points = points + :pointChange, modifiedAt = :modifiedAt, modifiedBy = :modifiedBy
            WHERE gameId = :gameId AND userId = :userId`
        );
    }

    applyPlayerPointChanges(
        gameId: number,
        pointChanges: PlayerPointChange[],
        modifiedBy: number
    ): void {
        const modifiedAt = new Date().toISOString();
        for (const { playerId, pointChange } of pointChanges) {
            if (pointChange === 0) {
                continue;
            }
            this.updatePlayerPointsStatement().run({ gameId, userId: playerId, pointChange, modifiedBy, modifiedAt });
        }
    }

    private updatePlayerChomboCountStatement(): Statement<{
        gameId: number,
        userId: number,
        chomboCountChange: number,
        modifiedBy: number,
        modifiedAt: string
    }, void> {
        return dbManager.db.prepare(`
            UPDATE userToGame
            SET chomboCount = chomboCount + :chomboCountChange, modifiedAt = :modifiedAt, modifiedBy = :modifiedBy
            WHERE gameId = :gameId AND userId = :userId`
        );
    }

    updatePlayerChomboCount(
        gameId: number,
        userId: number,
        chomboCountChange: number,
        modifiedBy: number
    ): void {
        const modifiedAt = new Date().toISOString();
        this.updatePlayerChomboCountStatement().run({
            gameId,
            userId,
            chomboCountChange,
            modifiedBy,
            modifiedAt
        });
    }

    private touchGameStatement(): Statement<{ id: number, modifiedBy: number, modifiedAt: string }, void> {
        return dbManager.db.prepare(`
            UPDATE game SET modifiedBy = :modifiedBy, modifiedAt = :modifiedAt WHERE id = :id`
        );
    }

    touchGame(gameId: number, modifiedBy: number): void {
        this.touchGameStatement().run({
            id: gameId,
            modifiedBy,
            modifiedAt: new Date().toISOString()
        });
    }

    private deleteGameRoundStatement(): Statement<{ gameId: number, roundNumber: number }, void> {
        return dbManager.db.prepare(`
            DELETE FROM gameRound WHERE gameId = :gameId AND roundNumber = :roundNumber`
        );
    }

    deleteGameRound(gameId: number, roundNumber: number): void {
        this.deleteGameRoundStatement().run({ gameId, roundNumber });
    }

    private deleteGameRoundsByGameIdStatement(): Statement<{ gameId: number }, void> {
        return dbManager.db.prepare('DELETE FROM gameRound WHERE gameId = :gameId');
    }

    deleteGameRoundsByGameId(gameId: number): void {
        this.deleteGameRoundsByGameIdStatement().run({ gameId });
    }

    private setLastRoundWasDeletedStatement(): Statement<{
        id: number,
        lastRoundWasDeleted: number,
        modifiedBy: number,
        modifiedAt: string
    }, void> {
        return dbManager.db.prepare(`
            UPDATE game
            SET lastRoundWasDeleted = :lastRoundWasDeleted, modifiedBy = :modifiedBy, modifiedAt = :modifiedAt
            WHERE id = :id`
        );
    }

    setLastRoundWasDeleted(gameId: number, value: boolean, modifiedBy: number): void {
        this.setLastRoundWasDeletedStatement().run({
            id: gameId,
            lastRoundWasDeleted: booleanToInteger(value),
            modifiedBy,
            modifiedAt: new Date().toISOString()
        });
    }

    private finishGameStatement(): Statement<{
        id: number,
        modifiedBy: number,
        endedAt: string,
        modifiedAt: string
    }, void> {
        return dbManager.db.prepare(`
            UPDATE game
            SET status = 'FINISHED', endedAt = :endedAt, modifiedBy = :modifiedBy, modifiedAt = :modifiedAt
            WHERE id = :id`
        );
    }

    finishGame(gameId: number, modifiedBy: number, endedAt: Date): void {
        const timestamp = endedAt.toISOString();
        this.finishGameStatement().run({
            id: gameId,
            modifiedBy,
            endedAt: timestamp,
            modifiedAt: timestamp
        });
    }

    private undoFinishGameStatement(): Statement<{
        id: number,
        modifiedBy: number,
        modifiedAt: string
    }, void> {
        return dbManager.db.prepare(`
            UPDATE game
            SET status = 'IN_PROGRESS', endedAt = NULL, modifiedBy = :modifiedBy, modifiedAt = :modifiedAt
            WHERE id = :id`
        );
    }

    undoFinishGame(gameId: number, modifiedBy: number): void {
        this.undoFinishGameStatement().run({
            id: gameId,
            modifiedBy,
            modifiedAt: new Date().toISOString()
        });
    }

    findGamePlayersByGameIds(gameIds: number[]): GamePlayer[] {
        if (gameIds.length === 0) {
            return [];
        }

        const placeholders = gameIds.map(() => '?').join(',');
        const query = `
            SELECT
                u.name,
                u.telegramUsername,
                p.firstName AS profileFirstName,
                p.lastName AS profileLastName,
                p.hideProfile AS profileHidden,
                utg.*,
                COALESCE(urc.ratingChange, 0) AS ratingChange
            FROM userToGame utg
            JOIN user u ON utg.userId = u.id
            LEFT JOIN profile p ON p.userId = utg.userId
            LEFT JOIN userRatingChange urc ON urc.userId = utg.userId AND urc.gameId = utg.gameId
            WHERE utg.gameId IN (${placeholders})
        `;

        const statement: Statement<number[], GamePlayerDBEntity> = dbManager.db.prepare(query);
        return statement.all(...gameIds).map(gamePlayerFromDBEntity);
    }

    findGames(filters: GameFilters): Game[] {
        let query = `
            SELECT DISTINCT g.*
            FROM game g
        `;
        const params: any[] = [];
        const conditions: string[] = [];

        if (filters.userId !== undefined) {
            query += ` JOIN userToGame utg ON g.id = utg.gameId`;
            conditions.push('utg.userId = ?');
            params.push(filters.userId);
        }

        if (filters.clubId !== undefined) {
            query += ` JOIN event e ON g.eventId = e.id`;
            conditions.push('e.clubId = ?');
            params.push(filters.clubId);
        }

        if (filters.dateFrom !== undefined) {
            conditions.push('g.createdAt >= ?');
            params.push(filters.dateFrom.toISOString());
        }

        if (filters.dateTo !== undefined) {
            conditions.push('g.createdAt <= ?');
            params.push(filters.dateTo.toISOString());
        }

        if (filters.eventId !== undefined) {
            conditions.push('g.eventId = ?');
            params.push(filters.eventId);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const sortOrder = filters.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        query += ` ORDER BY g.createdAt ${sortOrder}`;

        if (filters.limit !== undefined) {
            query += ` LIMIT ?`;
            params.push(filters.limit);
        }

        if (filters.offset !== undefined) {
            query += ` OFFSET ?`;
            params.push(filters.offset);
        }

        const statement: Statement<any[], GameDBEntity> = dbManager.db.prepare(query);
        return statement.all(...params).map(gameFromDBEntity);
    }

    private updateGameStatement(): Statement<{
        eventId: number,
        modifiedBy: number,
        id: number,
        createdAt: string,
        modifiedAt: string,
        tournamentRound: number | null,
        tournamentTable: string | null
    }, void> {
        return dbManager.db.prepare(`
            UPDATE game
            SET eventId = :eventId, modifiedBy = :modifiedBy, createdAt = :createdAt, modifiedAt = :modifiedAt,
                tournamentRound = :tournamentRound, tournamentTable = :tournamentTable
            WHERE id = :id`
        );
    }

    updateGame(gameId: number, eventId: number, modifiedBy: number, createdAt: Date, tournamentRound: number | null, tournamentTable: string | null): void {
        this.updateGameStatement().run({ eventId, modifiedBy, id: gameId, createdAt: createdAt.toISOString(), modifiedAt: new Date().toISOString(), tournamentRound, tournamentTable });
    }

    private deleteGamePlayersByGameIdStatement(): Statement<{ gameId: number }, void> {
        return dbManager.db.prepare('DELETE FROM userToGame WHERE gameId = :gameId');
    }

    deleteGamePlayersByGameId(gameId: number): void {
        this.deleteGamePlayersByGameIdStatement().run({ gameId });
    }

    private deleteGameByIdStatement(): Statement<{ id: number }, void> {
        return dbManager.db.prepare('DELETE FROM game WHERE id = :id');
    }

    deleteGameById(gameId: number): void {
        this.deleteGameByIdStatement().run({ id: gameId });
    }

    private findGameByEventAndTimestampStatement(): Statement<{ eventId: number, timestamp: string }, GameDBEntity> {
        return dbManager.db.prepare('SELECT * FROM game WHERE eventId = :eventId AND createdAt = :timestamp');
    }

    findGameByEventAndTimestamp(eventId: number, timestamp: Date): Game | undefined {
        const gameDBEntity = this.findGameByEventAndTimestampStatement().get({ eventId, timestamp: timestamp.toISOString() });
        return gameDBEntity !== undefined ? gameFromDBEntity(gameDBEntity) : undefined;
    }

    private findGameByEventRoundAndTableStatement(): Statement<{
        eventId: number,
        tournamentRound: number,
        tournamentTable: string
    }, GameDBEntity> {
        return dbManager.db.prepare(
            'SELECT * FROM game WHERE eventId = :eventId AND tournamentRound = :tournamentRound AND tournamentTable = :tournamentTable'
        );
    }

    findGameByEventRoundAndTable(eventId: number, tournamentRound: number, tournamentTable: string): Game | undefined {
        const gameDBEntity = this.findGameByEventRoundAndTableStatement().get({ eventId, tournamentRound, tournamentTable });
        return gameDBEntity !== undefined ? gameFromDBEntity(gameDBEntity) : undefined;
    }
}

interface GameDBEntity {
    id: number;
    eventId: number;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
    tournamentRound: number | null;
    tournamentTable: string | null;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
    lastRoundWasDeleted: number;
}

function gameFromDBEntity(dbEntity: GameDBEntity): Game {
    return {
        id: dbEntity.id,
        eventId: dbEntity.eventId,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy,
        tournamentRound: dbEntity.tournamentRound,
        tournamentTable: dbEntity.tournamentTable !== null ? String(dbEntity.tournamentTable) : null,
        status: parseGameStatus(dbEntity.status),
        startedAt: dbEntity.startedAt !== null ? new Date(dbEntity.startedAt) : null,
        endedAt: dbEntity.endedAt !== null ? new Date(dbEntity.endedAt) : null,
        lastRoundWasDeleted: Boolean(dbEntity.lastRoundWasDeleted)
    }
}

interface GameRoundDBEntity {
    gameId: number;
    roundNumber: number;
    wind: string;
    dealerNumber: number;
    counters: number;
    riichiSticks: number;
    result: string;
}

function gameRoundFromDBEntity(dbEntity: GameRoundDBEntity): GameRound {
    return {
        gameId: dbEntity.gameId,
        roundNumber: dbEntity.roundNumber,
        wind: parseWind(dbEntity.wind),
        dealerNumber: dbEntity.dealerNumber,
        counters: dbEntity.counters,
        riichiSticks: dbEntity.riichiSticks,
        result: JSON.parse(dbEntity.result)
    };
}

export interface GamePlayerDBEntity {
    gameId: number;
    userId: number;
    name: string;
    telegramUsername: string | null;
    profileFirstName: string | null;
    profileLastName: string | null;
    profileHidden: number | null;
    points: number;
    ratingChange: number;
    startPlace: string | null;
    chomboCount: number;
}

function gamePlayerFromDBEntity(dbEntity: GamePlayerDBEntity): GamePlayer {
    return {
        ...dbEntity,
        profileHidden: Boolean(dbEntity.profileHidden),
        startPlace: dbEntity.startPlace !== null ? parseWind(dbEntity.startPlace) : null,
        ratingChange: dbEntity.ratingChange / RATING_TO_POINTS_COEFFICIENT
    }
}