import type { Statement } from 'better-sqlite3';
import { formatDateForSqlite } from '../db/dbUtils.ts';
import type { Game, GameFilters, GamePlayer } from '../model/GameModels.ts';
import { db } from '../db/dbInit.ts';

export class GameRepository {

    private createGameStatement: Statement<{
        eventId: number,
        modifiedBy: number
    }, void> = db.prepare(
        `INSERT INTO game (event_id, modified_by) 
         VALUES (:eventId, :modifiedBy)`
    );

    createGame(eventId: number, modifiedBy: number): number {
        return Number(this.createGameStatement.run({ eventId, modifiedBy }).lastInsertRowid);
    }

    private addGamePlayerStatement: Statement<{
        gameId: number,
        userId: number,
        points: number,
        startPlace: string | undefined,
        modifiedBy: number
    }, void> = db.prepare(
        `INSERT INTO user_to_game (game_id, user_id, points, start_place, modified_by)
         VALUES (:gameId, :userId, :points, :startPlace, :modifiedBy)`
    );

    addGamePlayer(gameId: number, userId: number, points: number, startPlace: string | undefined, modifiedBy: number): void {
        this.addGamePlayerStatement.run({ gameId, userId, points, startPlace, modifiedBy });
    }

    private findGameByIdStatement: Statement<{ id: number }, Game> =
        db.prepare('SELECT * FROM game WHERE id = :id');

    findGameById(gameId: number): Game | undefined {
        return this.findGameByIdStatement.get({ id: gameId });
    }

    private findGamePlayersByGameIdStatement: Statement<{ gameId: number }, GamePlayer> = db.prepare(
        `SELECT utg.*, u.name, u.telegram_username
         FROM user_to_game utg
         JOIN user u ON utg.user_id = u.id
         WHERE utg.game_id = :gameId
         ORDER BY points DESC, user_id`
    );

    findGamePlayersByGameId(gameId: number): GamePlayer[] {
        return this.findGamePlayersByGameIdStatement.all({ gameId });
    }

    findGamePlayersByGameIds(gameIds: number[]): GamePlayer[] {
        if (gameIds.length === 0) {
            return [];
        }

        const placeholders = gameIds.map(() => '?').join(',');
        const query = `
            SELECT utg.*, u.name, u.telegram_username
            FROM user_to_game utg
            JOIN user u ON utg.user_id = u.id
            WHERE utg.game_id IN (${placeholders})
        `;

        const statement: Statement<number[], GamePlayer> = db.prepare(query);
        return statement.all(...gameIds);
    }

    findGames(filters: GameFilters): Game[] {
        let query = `
            SELECT DISTINCT g.*
            FROM game g
        `;
        const params: any[] = [];
        const conditions: string[] = [];

        if (filters.userId !== undefined) {
            query += ` JOIN user_to_game utg ON g.id = utg.game_id`;
            conditions.push('utg.user_id = ?');
            params.push(filters.userId);
        }

        if (filters.dateFrom !== undefined) {
            conditions.push('g.created_at >= ?');
            params.push(formatDateForSqlite(filters.dateFrom));
        }

        if (filters.dateTo !== undefined) {
            conditions.push('g.created_at <= ?');
            params.push(formatDateForSqlite(filters.dateTo));
        }

        if (filters.eventId !== undefined) {
            conditions.push('g.event_id = ?');
            params.push(filters.eventId);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY g.created_at';

        const statement: Statement<any[], Game> = db.prepare(query);
        return statement.all(...params);
    }

    private updateGameStatement: Statement<{
        eventId: number,
        modifiedBy: number,
        id: number
    }, void> = db.prepare(
        `UPDATE game
         SET event_id = :eventId, modified_by = :modifiedBy, modified_at = CURRENT_TIMESTAMP
         WHERE id = :id`
    );

    updateGame(gameId: number, eventId: number, modifiedBy: number): void {
        this.updateGameStatement.run({ eventId, modifiedBy, id: gameId });
    }

    private deleteGamePlayersByGameIdStatement: Statement<{ gameId: number }, void> =
        db.prepare('DELETE FROM user_to_game WHERE game_id = :gameId');

    deleteGamePlayersByGameId(gameId: number): void {
        this.deleteGamePlayersByGameIdStatement.run({ gameId });
    }

    private deleteGameByIdStatement: Statement<{ id: number }, void> =
        db.prepare('DELETE FROM game WHERE id = :id');

    deleteGameById(gameId: number): void {
        this.deleteGameByIdStatement.run({ id: gameId });
    }
}
