import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { GameRules } from '../model/EventModels.ts';

export class GameRulesRepository {
    private findAllGameRulesStatement(): Statement<[], GameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                name,
                numberOfPlayers,
                uma,
                startingPoints,
                startingRating,
                minimumGamesForRating,
                chomboPointsAfterUma
            FROM gameRules
            ORDER BY id ASC`
        );
    }

    findAllGameRules(): GameRules[] {
        return this.findAllGameRulesStatement().all().map(gameRulesFromDBEntity);
    }

    private findGameRulesByIdStatement(): Statement<{ id: number }, GameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                name,
                numberOfPlayers,
                uma,
                startingPoints,
                startingRating,
                minimumGamesForRating,
                chomboPointsAfterUma
            FROM gameRules
            WHERE id = :id`
        );
    }

    findGameRulesById(id: number): GameRules | undefined {
        const dbEntity = this.findGameRulesByIdStatement().get({ id });
        return dbEntity !== undefined ? gameRulesFromDBEntity(dbEntity) : undefined;
    }

    private createGameRulesStatement(): Statement<GameRulesCreateParams, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO gameRules (name, numberOfPlayers, uma, startingPoints, startingRating)
            VALUES (:name, :numberOfPlayers, :uma, :startingPoints, :startingRating)
            RETURNING id`
        );
    }

    createGameRules(params: GameRulesCreateParams): number {
        const result = this.createGameRulesStatement().get(params);
        return result!.id;
    }

    private updateGameRulesStatement(): Statement<GameRulesUpdateParams & { id: number }, { changes: number }> {
        return dbManager.db.prepare(`
            UPDATE gameRules
            SET
                name = COALESCE(:name, name),
                numberOfPlayers = COALESCE(:numberOfPlayers, numberOfPlayers),
                uma = COALESCE(:uma, uma),
                startingPoints = COALESCE(:startingPoints, startingPoints),
                startingRating = COALESCE(:startingRating, startingRating)
            WHERE id = :id`
        );
    }

    updateGameRules(id: number, params: GameRulesUpdateParams): boolean {
        const result = this.updateGameRulesStatement().run({ ...params, id });
        return result.changes > 0;
    }

    private deleteGameRulesStatement(): Statement<{ id: number }, { changes: number }> {
        return dbManager.db.prepare(`DELETE FROM gameRules WHERE id = :id`);
    }

    deleteGameRules(id: number): boolean {
        const result = this.deleteGameRulesStatement().run({ id });
        return result.changes > 0;
    }

    gameRulesExists(id: number): boolean {
        const result = dbManager.db.prepare(`SELECT 1 FROM gameRules WHERE id = ?`).get(id);
        return result !== undefined;
    }

    isGameRulesUsedByEventsWithGames(id: number): boolean {
        const result = dbManager.db.prepare(`
            SELECT 1
            FROM event e
            WHERE e.gameRules = ?
            AND EXISTS (SELECT 1 FROM game WHERE game.eventId = e.id)
            LIMIT 1
        `).get(id);
        return result !== undefined;
    }

    countEventsUsingGameRules(id: number): number {
        const result = dbManager.db.prepare(`
            SELECT COUNT(*) as count
            FROM event
            WHERE gameRules = ?
        `).get(id) as { count: number };
        return result.count;
    }
}

interface GameRulesDBEntity {
    id: number;
    name: string;
    numberOfPlayers: number;
    uma: string;
    startingPoints: number;
    startingRating: number;
    minimumGamesForRating: number;
    chomboPointsAfterUma: number | null;
}

interface GameRulesCreateParams {
    name: string;
    numberOfPlayers: number;
    uma: string;
    startingPoints: number;
    startingRating: number;
}

interface GameRulesUpdateParams {
    name?: string;
    numberOfPlayers?: number;
    uma?: string;
    startingPoints?: number;
    startingRating?: number;
}

function gameRulesFromDBEntity(dbEntity: GameRulesDBEntity): GameRules {
    return {
        id: dbEntity.id,
        name: dbEntity.name,
        numberOfPlayers: dbEntity.numberOfPlayers,
        uma: JSON.parse(dbEntity.uma),
        startingPoints: dbEntity.startingPoints,
        startingRating: dbEntity.startingRating,
        minimumGamesForRating: dbEntity.minimumGamesForRating,
        chomboPointsAfterUma: dbEntity.chomboPointsAfterUma
    };
}
