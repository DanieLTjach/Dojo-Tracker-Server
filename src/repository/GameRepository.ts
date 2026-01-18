import type { Statement } from 'better-sqlite3';
import { dateFromSqliteString, dateToSqliteString } from '../db/dbUtils.ts';
import type { Game, GameFilters, GamePlayer } from '../model/GameModels.ts';
import { db } from '../db/dbInit.ts';

export class GameRepository {

    private createGameStatement: Statement<{
        eventId: number,
        modifiedBy: number,
        timestamp: string
    }, void> = db.prepare(
        `INSERT INTO game (eventId, modifiedBy, createdAt, modifiedAt) 
         VALUES (:eventId, :modifiedBy, :timestamp, :timestamp)`
    );

    createGame(eventId: number, modifiedBy: number, timestamp: Date): number {
        return Number(
            this.createGameStatement.run({
                eventId,
                modifiedBy,
                timestamp: dateToSqliteString(timestamp)
            }).lastInsertRowid
        );
    }

    private addGamePlayerStatement: Statement<{
        gameId: number,
        userId: number,
        points: number,
        startPlace: string | undefined,
        modifiedBy: number
    }, void> = db.prepare(
        `INSERT INTO userToGame (gameId, userId, points, startPlace, modifiedBy)
         VALUES (:gameId, :userId, :points, :startPlace, :modifiedBy)`
    );

    addGamePlayer(gameId: number, userId: number, points: number, startPlace: string | undefined, modifiedBy: number): void {
        this.addGamePlayerStatement.run({ gameId, userId, points, startPlace, modifiedBy });
    }

    private findGameByIdStatement: Statement<{ id: number }, GameDBEntity> =
        db.prepare('SELECT * FROM game WHERE id = :id');

    findGameById(gameId: number): Game | undefined {
        const gameDBEntity = this.findGameByIdStatement.get({ id: gameId });
        return gameDBEntity !== undefined ? gameFromDBEntity(gameDBEntity) : undefined;
    }

    private findGamePlayersByGameIdStatement: Statement<{ gameId: number }, GamePlayerDBEntity> = db.prepare(
        `SELECT utg.*, u.name, u.telegramUsername
         FROM userToGame utg
         JOIN user u ON utg.userId = u.id
         WHERE utg.gameId = :gameId
         ORDER BY points DESC, userId`
    );

    findGamePlayersByGameId(gameId: number): GamePlayer[] {
        return this.findGamePlayersByGameIdStatement.all({ gameId }).map(gamePlayerFromDBEntity);
    }

    findGamePlayersByGameIds(gameIds: number[]): GamePlayer[] {
        if (gameIds.length === 0) {
            return [];
        }

        const placeholders = gameIds.map(() => '?').join(',');
        const query = `
            SELECT utg.*, u.name, u.telegramUsername
            FROM userToGame utg
            JOIN user u ON utg.userId = u.id
            WHERE utg.gameId IN (${placeholders})
        `;

        const statement: Statement<number[], GamePlayerDBEntity> = db.prepare(query);
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

        if (filters.dateFrom !== undefined) {
            conditions.push('g.createdAt >= ?');
            params.push(dateToSqliteString(filters.dateFrom));
        }

        if (filters.dateTo !== undefined) {
            conditions.push('g.createdAt <= ?');
            params.push(dateToSqliteString(filters.dateTo));
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

        const statement: Statement<any[], GameDBEntity> = db.prepare(query);
        return statement.all(...params).map(gameFromDBEntity);
    }

    private updateGameStatement: Statement<{
        eventId: number,
        modifiedBy: number,
        id: number
    }, void> = db.prepare(
        `UPDATE game
         SET eventId = :eventId, modifiedBy = :modifiedBy, modifiedAt = CURRENT_TIMESTAMP
         WHERE id = :id`
    );

    updateGame(gameId: number, eventId: number, modifiedBy: number): void {
        this.updateGameStatement.run({ eventId, modifiedBy, id: gameId });
    }

    private deleteGamePlayersByGameIdStatement: Statement<{ gameId: number }, void> =
        db.prepare('DELETE FROM userToGame WHERE gameId = :gameId');

    deleteGamePlayersByGameId(gameId: number): void {
        this.deleteGamePlayersByGameIdStatement.run({ gameId });
    }

    private deleteGameByIdStatement: Statement<{ id: number }, void> =
        db.prepare('DELETE FROM game WHERE id = :id');

    deleteGameById(gameId: number): void {
        this.deleteGameByIdStatement.run({ id: gameId });
    }

    private countGamesByEventIdStatement: Statement<{ eventId: number }, { count: number }> =
        db.prepare('SELECT COUNT(*) as count FROM game WHERE eventId = :eventId');

    countGamesByEventId(eventId: number): number {
        const result = this.countGamesByEventIdStatement.get({ eventId });
        return result?.count ?? 0;
    }
}

interface GameDBEntity {
    id: number;
    eventId: number;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

function gameFromDBEntity(dbEntity: GameDBEntity): Game {
    return {
        ...dbEntity,
        createdAt: dateFromSqliteString(dbEntity.createdAt),
        modifiedAt: dateFromSqliteString(dbEntity.modifiedAt)
    }
}

interface GamePlayerDBEntity {
    gameId: number;
    userId: number;
    name: string;
    telegramUsername: string | null;
    points: number;
    startPlace: string;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

function gamePlayerFromDBEntity(dbEntity: GamePlayerDBEntity): GamePlayer {
    return {
        gameId: dbEntity.gameId,
        userId: dbEntity.userId,
        name: dbEntity.name,
        telegramUsername: dbEntity.telegramUsername,
        points: dbEntity.points,
        startPlace: dbEntity.startPlace,
        createdAt: dateFromSqliteString(dbEntity.createdAt),
        modifiedAt: dateFromSqliteString(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}