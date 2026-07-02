import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import { booleanToInteger } from '../db/dbUtils.ts';
import type {
    ClubUsageAccount,
    ClubUsageAdjustment,
    ClubUsageDaily,
    UsageAction,
    UsageAdjustmentType,
} from '../model/UsageModels.ts';

export class UsageRepository {
    private findAccountByClubIdStatement(): Statement<{ clubId: number }, ClubUsageAccountDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                clubId,
                creditsBalance,
                overdraftCutoff,
                overdraftMultiplier,
                isEnforced,
                createdAt,
                modifiedAt,
                modifiedBy
            FROM clubUsageAccount
            WHERE clubId = :clubId
        `);
    }

    findAccountByClubId(clubId: number): ClubUsageAccount | undefined {
        const row = this.findAccountByClubIdStatement().get({ clubId });
        return row !== undefined ? accountFromDBEntity(row) : undefined;
    }

    private createAccountStatement(): Statement<{
        clubId: number;
        creditsBalance: number;
        overdraftCutoff: number;
        overdraftMultiplier: number;
        isEnforced: number;
        createdAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO clubUsageAccount (
                clubId,
                creditsBalance,
                overdraftCutoff,
                overdraftMultiplier,
                isEnforced,
                createdAt,
                modifiedAt,
                modifiedBy
            )
            VALUES (
                :clubId,
                :creditsBalance,
                :overdraftCutoff,
                :overdraftMultiplier,
                :isEnforced,
                :createdAt,
                :createdAt,
                :modifiedBy
            )
        `);
    }

    createAccount(params: CreateUsageAccountParams): ClubUsageAccount {
        this.createAccountStatement().run({
            ...params,
            isEnforced: booleanToInteger(params.isEnforced),
            createdAt: params.createdAt.toISOString(),
        });
        return this.findAccountByClubId(params.clubId)!;
    }

    private updateBalanceStatement(): Statement<{
        clubId: number;
        delta: number;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE clubUsageAccount
            SET creditsBalance = creditsBalance + :delta,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE clubId = :clubId
        `);
    }

    updateBalance(clubId: number, delta: number, modifiedAt: Date, modifiedBy: number): ClubUsageAccount {
        this.updateBalanceStatement().run({
            clubId,
            delta,
            modifiedAt: modifiedAt.toISOString(),
            modifiedBy,
        });
        return this.findAccountByClubId(clubId)!;
    }

    private setBalanceStatement(): Statement<{
        clubId: number;
        creditsBalance: number;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE clubUsageAccount
            SET creditsBalance = :creditsBalance,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE clubId = :clubId
        `);
    }

    setBalance(clubId: number, creditsBalance: number, modifiedAt: Date, modifiedBy: number): ClubUsageAccount {
        this.setBalanceStatement().run({
            clubId,
            creditsBalance,
            modifiedAt: modifiedAt.toISOString(),
            modifiedBy,
        });
        return this.findAccountByClubId(clubId)!;
    }

    private updateOverdraftCutoffStatement(): Statement<{
        clubId: number;
        overdraftCutoff: number;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE clubUsageAccount
            SET overdraftCutoff = :overdraftCutoff,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE clubId = :clubId
        `);
    }

    updateOverdraftCutoff(
        clubId: number,
        overdraftCutoff: number,
        modifiedAt: Date,
        modifiedBy: number
    ): ClubUsageAccount {
        this.updateOverdraftCutoffStatement().run({
            clubId,
            overdraftCutoff,
            modifiedAt: modifiedAt.toISOString(),
            modifiedBy,
        });
        return this.findAccountByClubId(clubId)!;
    }

    private addDailyUsageStatement(): Statement<{
        clubId: number;
        usageDate: string;
        action: UsageAction;
        actionCount: number;
        baseCredits: number;
        chargedCredits: number;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO clubUsageDaily (
                clubId,
                usageDate,
                action,
                actionCount,
                baseCredits,
                chargedCredits,
                createdAt,
                modifiedAt,
                modifiedBy
            )
            VALUES (
                :clubId,
                :usageDate,
                :action,
                :actionCount,
                :baseCredits,
                :chargedCredits,
                :modifiedAt,
                :modifiedAt,
                :modifiedBy
            )
            ON CONFLICT(clubId, usageDate, action) DO UPDATE SET
                actionCount = actionCount + excluded.actionCount,
                baseCredits = baseCredits + excluded.baseCredits,
                chargedCredits = chargedCredits + excluded.chargedCredits,
                modifiedAt = excluded.modifiedAt,
                modifiedBy = excluded.modifiedBy
        `);
    }

    addDailyUsage(params: AddDailyUsageParams): void {
        this.addDailyUsageStatement().run({
            ...params,
            modifiedAt: params.modifiedAt.toISOString(),
        });
    }

    listDailyUsage(clubId: number, dateFrom?: string, dateTo?: string): ClubUsageDaily[] {
        const conditions = ['clubId = :clubId'];
        if (dateFrom !== undefined) {
            conditions.push('usageDate >= :dateFrom');
        }
        if (dateTo !== undefined) {
            conditions.push('usageDate <= :dateTo');
        }

        const rows = dbManager.db.prepare(`
            SELECT
                clubId,
                usageDate,
                action,
                actionCount,
                baseCredits,
                chargedCredits,
                createdAt,
                modifiedAt,
                modifiedBy
            FROM clubUsageDaily
            WHERE ${conditions.join(' AND ')}
            ORDER BY usageDate DESC, action ASC
        `).all({ clubId, dateFrom, dateTo }) as ClubUsageDailyDBEntity[];

        return rows.map(dailyUsageFromDBEntity);
    }

    private createAdjustmentStatement(): Statement<{
        clubId: number;
        type: UsageAdjustmentType;
        creditsDelta: number | null;
        previousCreditsBalance: number;
        newCreditsBalance: number;
        previousOverdraftCutoff: number;
        newOverdraftCutoff: number;
        reason: string;
        externalReference: string | null;
        createdAt: string;
        createdBy: number;
    }, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO clubUsageAdjustment (
                clubId,
                type,
                creditsDelta,
                previousCreditsBalance,
                newCreditsBalance,
                previousOverdraftCutoff,
                newOverdraftCutoff,
                reason,
                externalReference,
                createdAt,
                createdBy
            )
            VALUES (
                :clubId,
                :type,
                :creditsDelta,
                :previousCreditsBalance,
                :newCreditsBalance,
                :previousOverdraftCutoff,
                :newOverdraftCutoff,
                :reason,
                :externalReference,
                :createdAt,
                :createdBy
            )
            RETURNING id
        `);
    }

    createAdjustment(params: CreateUsageAdjustmentParams): ClubUsageAdjustment {
        const row = this.createAdjustmentStatement().get({
            ...params,
            createdAt: params.createdAt.toISOString(),
        });
        return this.findAdjustmentById(row!.id)!;
    }

    private findAdjustmentByIdStatement(): Statement<{ id: number }, ClubUsageAdjustmentDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                clubId,
                type,
                creditsDelta,
                previousCreditsBalance,
                newCreditsBalance,
                previousOverdraftCutoff,
                newOverdraftCutoff,
                reason,
                externalReference,
                createdAt,
                createdBy
            FROM clubUsageAdjustment
            WHERE id = :id
        `);
    }

    findAdjustmentById(id: number): ClubUsageAdjustment | undefined {
        const row = this.findAdjustmentByIdStatement().get({ id });
        return row !== undefined ? adjustmentFromDBEntity(row) : undefined;
    }
}

export interface CreateUsageAccountParams {
    clubId: number;
    creditsBalance: number;
    overdraftCutoff: number;
    overdraftMultiplier: number;
    isEnforced: boolean;
    createdAt: Date;
    modifiedBy: number;
}

export interface AddDailyUsageParams {
    clubId: number;
    usageDate: string;
    action: UsageAction;
    actionCount: number;
    baseCredits: number;
    chargedCredits: number;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface CreateUsageAdjustmentParams {
    clubId: number;
    type: UsageAdjustmentType;
    creditsDelta: number | null;
    previousCreditsBalance: number;
    newCreditsBalance: number;
    previousOverdraftCutoff: number;
    newOverdraftCutoff: number;
    reason: string;
    externalReference: string | null;
    createdAt: Date;
    createdBy: number;
}

interface ClubUsageAccountDBEntity {
    clubId: number;
    creditsBalance: number;
    overdraftCutoff: number;
    overdraftMultiplier: number;
    isEnforced: number;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

interface ClubUsageDailyDBEntity {
    clubId: number;
    usageDate: string;
    action: UsageAction;
    actionCount: number;
    baseCredits: number;
    chargedCredits: number;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

interface ClubUsageAdjustmentDBEntity {
    id: number;
    clubId: number;
    type: UsageAdjustmentType;
    creditsDelta: number | null;
    previousCreditsBalance: number;
    newCreditsBalance: number;
    previousOverdraftCutoff: number;
    newOverdraftCutoff: number;
    reason: string;
    externalReference: string | null;
    createdAt: string;
    createdBy: number;
}

function accountFromDBEntity(row: ClubUsageAccountDBEntity): ClubUsageAccount {
    return {
        clubId: row.clubId,
        creditsBalance: row.creditsBalance,
        overdraftCutoff: row.overdraftCutoff,
        overdraftMultiplier: row.overdraftMultiplier,
        isEnforced: Boolean(row.isEnforced),
        createdAt: new Date(row.createdAt),
        modifiedAt: new Date(row.modifiedAt),
        modifiedBy: row.modifiedBy,
    };
}

function dailyUsageFromDBEntity(row: ClubUsageDailyDBEntity): ClubUsageDaily {
    return {
        clubId: row.clubId,
        usageDate: row.usageDate,
        action: row.action,
        actionCount: row.actionCount,
        baseCredits: row.baseCredits,
        chargedCredits: row.chargedCredits,
        createdAt: new Date(row.createdAt),
        modifiedAt: new Date(row.modifiedAt),
        modifiedBy: row.modifiedBy,
    };
}

function adjustmentFromDBEntity(row: ClubUsageAdjustmentDBEntity): ClubUsageAdjustment {
    return {
        id: row.id,
        clubId: row.clubId,
        type: row.type,
        creditsDelta: row.creditsDelta,
        previousCreditsBalance: row.previousCreditsBalance,
        newCreditsBalance: row.newCreditsBalance,
        previousOverdraftCutoff: row.previousOverdraftCutoff,
        newOverdraftCutoff: row.newOverdraftCutoff,
        reason: row.reason,
        externalReference: row.externalReference,
        createdAt: new Date(row.createdAt),
        createdBy: row.createdBy,
    };
}
