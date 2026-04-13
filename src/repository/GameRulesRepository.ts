import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { GameRules, GameRulesDetails } from '../model/EventModels.ts';
import { parseUma } from '../util/UmaUtil.ts';
import { parseUmaTieBreak } from '../util/EnumUtil.ts';

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
                chomboPointsAfterUma,
                umaTieBreak,
                details
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
                chomboPointsAfterUma,
                umaTieBreak,
                details
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
                chomboPointsAfterUma,
                umaTieBreak,
                details
            FROM gameRules
            WHERE id = :id`
        );
    }

    findGameRulesById(id: number): GameRules | undefined {
        const dbEntity = this.findGameRulesByIdStatement().get({ id });
        return dbEntity !== undefined ? gameRulesFromDBEntity(dbEntity) : undefined;
    }

    private updateGameRulesDetailsStatement(): Statement<{ id: number; details: string | null }, void> {
        return dbManager.db.prepare(`
            UPDATE gameRules
            SET details = :details
            WHERE id = :id
        `);
    }

    updateGameRulesDetails(id: number, details: GameRulesDetails | null): void {
        this.updateGameRulesDetailsStatement().run({
            id,
            details: details ? JSON.stringify(details) : null
        });
    }

    private findAllGlobalGameRulesStatement(): Statement<[], GameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT id, name, clubId, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, umaTieBreak, details
            FROM gameRules
            WHERE clubId IS NULL
            ORDER BY id ASC`
        );
    }

    findAllGlobalGameRules(): GameRules[] {
        return this.findAllGlobalGameRulesStatement().all().map(gameRulesFromDBEntity);
    }

    private findAllGameRulesWithDetailsByClubIdStatement(): Statement<{ clubId: number }, GameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT id, name, clubId, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, umaTieBreak, details
            FROM gameRules
            WHERE clubId = :clubId AND details IS NOT NULL
            ORDER BY id ASC`
        );
    }

    findAllGameRulesWithDetailsByClubId(clubId: number): GameRules[] {
        return this.findAllGameRulesWithDetailsByClubIdStatement().all({ clubId }).map(gameRulesFromDBEntity);
    }

    private findAllGameRulesWithoutDetailsByClubIdStatement(): Statement<{ clubId: number }, GameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT id, name, clubId, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, umaTieBreak, details
            FROM gameRules
            WHERE clubId = :clubId AND details IS NULL
            ORDER BY id ASC`
        );
    }

    findAllGameRulesWithoutDetailsByClubId(clubId: number): GameRules[] {
        return this.findAllGameRulesWithoutDetailsByClubIdStatement().all({ clubId }).map(gameRulesFromDBEntity);
    }

    private insertGameRulesStatement(): Statement<InsertGameRulesParams, void> {
        return dbManager.db.prepare(`
            INSERT INTO gameRules (name, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, umaTieBreak, clubId)
            VALUES (:name, :numberOfPlayers, :uma, :startingPoints, :chomboPointsAfterUma, :umaTieBreak, :clubId)
        `);
    }

    insertGameRules(params: InsertGameRulesParams): number {
        const result = this.insertGameRulesStatement().run(params);
        return Number(result.lastInsertRowid);
    }

    private updateGameRulesStatement(): Statement<UpdateGameRulesParams, void> {
        return dbManager.db.prepare(`
            UPDATE gameRules
            SET name = :name, numberOfPlayers = :numberOfPlayers, uma = :uma,
                startingPoints = :startingPoints, chomboPointsAfterUma = :chomboPointsAfterUma,
                umaTieBreak = :umaTieBreak
            WHERE id = :id
        `);
    }

    updateGameRules(id: number, params: InsertGameRulesParams): void {
        this.updateGameRulesStatement().run({ id, ...params });
    }

    private deleteGameRulesStatement(): Statement<{ id: number }, void> {
        return dbManager.db.prepare(`DELETE FROM gameRules WHERE id = :id`);
    }

    deleteGameRules(id: number): void {
        this.deleteGameRulesStatement().run({ id });
    }
}

interface UpdateGameRulesParams extends InsertGameRulesParams {
    id: number;
}

export interface InsertGameRulesParams {
    name: string;
    numberOfPlayers: number;
    uma: string;
    startingPoints: number;
    chomboPointsAfterUma: number | null;
    umaTieBreak: string;
    clubId: number;
}

interface GameRulesDBEntity {
    id: number;
    name: string;
    clubId: number | null;
    numberOfPlayers: number;
    uma: string;
    startingPoints: number;
    chomboPointsAfterUma: number | null;
    umaTieBreak: string;
    details: string | null;
}

function gameRulesFromDBEntity(dbEntity: GameRulesDBEntity): GameRules {
    return {
        id: dbEntity.id,
        name: dbEntity.name,
        clubId: dbEntity.clubId,
        numberOfPlayers: dbEntity.numberOfPlayers,
        uma: parseUma(dbEntity.uma),
        startingPoints: dbEntity.startingPoints,
        chomboPointsAfterUma: dbEntity.chomboPointsAfterUma,
        umaTieBreak: parseUmaTieBreak(dbEntity.umaTieBreak),
        details: parseGameRulesDetails(dbEntity.details)
    };
}

function parseGameRulesDetails(details: string | null): GameRulesDetails | null {
    return details ? JSON.parse(details) : null;
}
