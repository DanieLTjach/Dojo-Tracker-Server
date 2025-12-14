import DatabaseManager from '../db/dbManager.js';
import { formatDateForSqlite } from '../db/dbUtils.ts';
import type { Game, GameFilters, GamePlayer } from './GameModels.ts';

export class GameRepository {
    private dbManager: DatabaseManager;

    constructor() {
        this.dbManager = new DatabaseManager();
    }

    async createGame(eventId: number, modifiedBy: number): Promise<number> {
        await this.dbManager.run(
            `INSERT INTO game (event_id, modified_by) 
             VALUES (?, ?)`,
            [eventId, modifiedBy]
        );

        const game = await this.dbManager.get('SELECT id FROM game ORDER BY id DESC LIMIT 1', []);
        return game.id;
    }

    async addGamePlayer(gameId: number, userId: number, points: number, startPlace: string | undefined, modifiedBy: number): Promise<void> {
        await this.dbManager.run(
            `INSERT INTO user_to_game (game_id, user_id, points, start_place, modified_by)
             VALUES (?, ?, ?, ?, ?)`,
            [gameId, userId, points, startPlace, modifiedBy]
        );
    }

    async findGameById(gameId: number): Promise<Game | null> {
        return await this.dbManager.get('SELECT * FROM game WHERE id = ?', [gameId]);
    }

    async findGamePlayersByGameId(gameId: number): Promise<GamePlayer[]> {
        return await this.dbManager.all(
            `SELECT utg.*, u.name, u.telegram_username
             FROM user_to_game utg
             JOIN user u ON utg.user_id = u.id
             WHERE utg.game_id = ?
             ORDER BY points DESC, user_id`,
            [gameId]
        );
    }

    async findGamePlayersByGameIds(gameIds: number[]): Promise<GamePlayer[]> {
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

        return await this.dbManager.all(query, gameIds);
    }

    async findGames(filters: GameFilters): Promise<Game[]> {
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

        return await this.dbManager.all(query, params);
    }

    async updateGame(gameId: number, eventId: number, modifiedBy: number): Promise<void> {
        await this.dbManager.run(
            `UPDATE game
             SET event_id = ?, modified_by = ?, modified_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [eventId, modifiedBy, gameId]
        );
    }

    async deleteGamePlayersByGameId(gameId: number): Promise<void> {
        await this.dbManager.run('DELETE FROM user_to_game WHERE game_id = ?', [gameId]);
    }

    async deleteGameById(gameId: number): Promise<void> {
        await this.dbManager.run('DELETE FROM game WHERE id = ?', [gameId]);
    }

    async findEventById(eventId: number): Promise<any | null> {
        return await this.dbManager.get('SELECT * FROM event WHERE id = ?', [eventId]);
    }
}
