import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { GameRules } from '../model/EventModels.ts';
import { parseUma } from '../util/UmaUtil.ts';

export class GameRulesRepository {
    private findAllGameRulesStatement(): Statement<[], GameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                name,
                clubId,
                numberOfPlayers,
                uma,
                startingPoints,
                startingRating,
                minimumGamesForRating,
                chomboPointsAfterUma,
                umaTieBreakByWind
            FROM gameRules
            ORDER BY id ASC`
        );
    }

    findAllGameRules(): GameRules[] {
        return this.findAllGameRulesStatement().all().map(gameRulesFromDBEntity);
    }

    private findAllGameRulesByClubIdStatement(): Statement<{ clubId: number }, GameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                name,
                clubId,
                numberOfPlayers,
                uma,
                startingPoints,
                startingRating,
                minimumGamesForRating,
                chomboPointsAfterUma,
                umaTieBreakByWind
            FROM gameRules
            WHERE clubId = :clubId OR clubId IS NULL
            ORDER BY id ASC`
        );
    }

    findAllGameRulesByClubId(clubId: number): GameRules[] {
        return this.findAllGameRulesByClubIdStatement().all({ clubId }).map(gameRulesFromDBEntity);
    }

    private findGameRulesByIdStatement(): Statement<{ id: number }, GameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                name,
                clubId,
                numberOfPlayers,
                uma,
                startingPoints,
                startingRating,
                minimumGamesForRating,
                chomboPointsAfterUma,
                umaTieBreakByWind
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
    clubId: number | null;
    numberOfPlayers: number;
    uma: string;
    startingPoints: number;
    startingRating: number;
    minimumGamesForRating: number;
    chomboPointsAfterUma: number | null;
    umaTieBreakByWind: number;
}

function gameRulesFromDBEntity(dbEntity: GameRulesDBEntity): GameRules {
    return {
        id: dbEntity.id,
        name: dbEntity.name,
        clubId: dbEntity.clubId,
        numberOfPlayers: dbEntity.numberOfPlayers,
        uma: parseUma(dbEntity.uma),
        startingPoints: dbEntity.startingPoints,
        startingRating: dbEntity.startingRating,
        minimumGamesForRating: dbEntity.minimumGamesForRating,
        chomboPointsAfterUma: dbEntity.chomboPointsAfterUma,
        umaTieBreakByWind: Boolean(dbEntity.umaTieBreakByWind)
    };
}
