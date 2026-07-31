import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import { booleanToInteger } from '../db/dbUtils.ts';
import type { GameRules, GameRulesDetails } from '../model/EventModels.ts';
import { parseUma } from '../util/UmaUtil.ts';
import { parseUmaTieBreak } from '../util/EnumUtil.ts';
import { parseGameRulesDetailsAndApplyPresets } from '../util/GameRulesDetailsUtil.ts';

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
                umaTieBreak,
                allowNonZeroSumUma,
                details
            FROM gameRules
            ORDER BY id ASC`);
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
                umaTieBreak,
                allowNonZeroSumUma,
                details
            FROM gameRules
            WHERE clubId = :clubId OR clubId IS NULL
            ORDER BY id ASC`);
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
                umaTieBreak,
                allowNonZeroSumUma,
                details
            FROM gameRules
            WHERE id = :id`);
    }

    findGameRulesById(id: number): GameRules | undefined {
        const dbEntity = this.findGameRulesByIdStatement().get({ id });
        return dbEntity !== undefined ? gameRulesFromDBEntity(dbEntity) : undefined;
    }

    private updateGameRulesDetailsStatement(): Statement<{ id: number, details: string | null }, void> {
        return dbManager.db.prepare(`
            UPDATE gameRules
            SET details = :details
            WHERE id = :id
        `);
    }

    updateGameRulesDetails(id: number, details: GameRulesDetails | null): void {
        this.updateGameRulesDetailsStatement().run({
            id,
            details: details ? JSON.stringify(details) : null,
        });
    }

    private insertGameRulesStatement(): Statement<GameRulesWriteParams, void> {
        return dbManager.db.prepare(`
            INSERT INTO gameRules (name, numberOfPlayers, uma, startingPoints, umaTieBreak, clubId, allowNonZeroSumUma)
            VALUES (:name, :numberOfPlayers, :uma, :startingPoints, :umaTieBreak, :clubId, :allowNonZeroSumUma)
        `);
    }

    insertGameRules(params: InsertGameRulesParams): number {
        const result = this.insertGameRulesStatement().run(toGameRulesWriteParams(params));
        return Number(result.lastInsertRowid);
    }

    private updateGameRulesStatement(): Statement<GameRulesWriteParams & { id: number }, void> {
        return dbManager.db.prepare(`
            UPDATE gameRules
            SET name = :name, numberOfPlayers = :numberOfPlayers, uma = :uma,
                startingPoints = :startingPoints,
                umaTieBreak = :umaTieBreak,
                allowNonZeroSumUma = :allowNonZeroSumUma
            WHERE id = :id
        `);
    }

    updateGameRules(id: number, params: InsertGameRulesParams): void {
        this.updateGameRulesStatement().run({ id, ...toGameRulesWriteParams(params) });
    }

    private deleteGameRulesStatement(): Statement<{ id: number }, void> {
        return dbManager.db.prepare(`DELETE FROM gameRules WHERE id = :id`);
    }

    deleteGameRules(id: number): void {
        this.deleteGameRulesStatement().run({ id });
    }
}

export interface InsertGameRulesParams {
    name: string;
    numberOfPlayers: number;
    uma: number[] | number[][];
    startingPoints: number;
    umaTieBreak: string;
    clubId: number | null;
    allowNonZeroSumUma?: boolean | undefined;
}

// SQLite has no boolean type, so uma is serialized and the opt-in flag stored as 0/1.
type GameRulesWriteParams = Omit<InsertGameRulesParams, 'uma' | 'allowNonZeroSumUma'> & {
    uma: string;
    allowNonZeroSumUma: number;
};

function toGameRulesWriteParams(params: InsertGameRulesParams): GameRulesWriteParams {
    return {
        ...params,
        uma: JSON.stringify(params.uma),
        allowNonZeroSumUma: booleanToInteger(params.allowNonZeroSumUma ?? false),
    };
}

interface GameRulesDBEntity {
    id: number;
    name: string;
    clubId: number | null;
    numberOfPlayers: number;
    uma: string;
    startingPoints: number;
    umaTieBreak: string;
    allowNonZeroSumUma: number;
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
        umaTieBreak: parseUmaTieBreak(dbEntity.umaTieBreak),
        allowNonZeroSumUma: Boolean(dbEntity.allowNonZeroSumUma),
        details: parseGameRulesDetailsAndApplyPresets(dbEntity.details, {
            numberOfPlayers: dbEntity.numberOfPlayers,
            startingPoints: dbEntity.startingPoints,
        }),
    };
}
