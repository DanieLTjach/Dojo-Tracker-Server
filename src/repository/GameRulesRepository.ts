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

function gameRulesFromDBEntity(dbEntity: GameRulesDBEntity): GameRules {
    return {
        id: dbEntity.id,
        name: dbEntity.name,
        numberOfPlayers: dbEntity.numberOfPlayers,
        uma: parseUma(dbEntity.uma),
        startingPoints: dbEntity.startingPoints,
        startingRating: dbEntity.startingRating,
        minimumGamesForRating: dbEntity.minimumGamesForRating,
        chomboPointsAfterUma: dbEntity.chomboPointsAfterUma
    };
}

function parseUma(umaString: string): number[] | number[][] {
    const parsedUma = umaString.split(';').map(part => part.split(',').map(Number));
    if (parsedUma.length === 1) {
        return parsedUma[0]!;
    }
    return parsedUma;
}
