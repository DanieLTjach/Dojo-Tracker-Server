import type { Statement } from 'better-sqlite3';
import type { Game, GameFilters, GamePlayer } from '../model/GameModels.ts';
import { dbManager } from '../db/dbInit.ts';
import { normalizeRatingChange } from '../service/RatingService.ts';

export class GameRepository {

    private createGameStatement(): Statement<{
        eventId: number,
        modifiedBy: number,
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO game (eventId, modifiedBy, createdAt, modifiedAt)
            VALUES (:eventId, :modifiedBy, :timestamp, :timestamp)`
        );
    }

    createGame(eventId: number, modifiedBy: number, timestamp: Date): number {
        return Number(
            this.createGameStatement().run({
                eventId,
                modifiedBy,
                timestamp: timestamp.toISOString()
            }).lastInsertRowid
        );
    }

    private addGamePlayerStatement(): Statement<{
        gameId: number,
        userId: number,
        points: number,
        startPlace: string | undefined,
        modifiedBy: number,
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO userToGame (gameId, userId, points, startPlace, modifiedBy, createdAt, modifiedAt)
            VALUES (:gameId, :userId, :points, :startPlace, :modifiedBy, :timestamp, :timestamp)`
        );
    }

    addGamePlayer(gameId: number, userId: number, points: number, startPlace: string | undefined, modifiedBy: number): void {
        this.addGamePlayerStatement().run({
            gameId,
            userId,
            points,
            startPlace,
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

    private findGamePlayersByGameIdStatement(): Statement<{ gameId: number }, GamePlayer> {
        return dbManager.db.prepare(`
            SELECT u.name, u.telegramUsername, utg.*, urc.ratingChange
            FROM userToGame utg
            JOIN user u ON utg.userId = u.id
            JOIN userRatingChange urc ON urc.userId = utg.userId AND urc.gameId = utg.gameId
            WHERE utg.gameId = :gameId
            ORDER BY points DESC, userId`
        );
    }

    findGamePlayersByGameId(gameId: number): GamePlayer[] {
        return this.findGamePlayersByGameIdStatement().all({ gameId }).map(normalizeRatingChange);
    }

    findGamePlayersByGameIds(gameIds: number[]): GamePlayer[] {
        if (gameIds.length === 0) {
            return [];
        }

        const placeholders = gameIds.map(() => '?').join(',');
        const query = `
            SELECT u.name, u.telegramUsername, utg.*, urc.ratingChange
            FROM userToGame utg
            JOIN user u ON utg.userId = u.id
            JOIN userRatingChange urc ON urc.userId = utg.userId AND urc.gameId = utg.gameId
            WHERE utg.gameId IN (${placeholders})
        `;

        const statement: Statement<number[], GamePlayer> = dbManager.db.prepare(query);
        return statement.all(...gameIds).map(normalizeRatingChange);
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
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            UPDATE game
            SET eventId = :eventId, modifiedBy = :modifiedBy, modifiedAt = :timestamp
            WHERE id = :id`
        );
    }

    updateGame(gameId: number, eventId: number, modifiedBy: number): void {
        this.updateGameStatement().run({ eventId, modifiedBy, id: gameId, timestamp: new Date().toISOString() });
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
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt)
    }
}
