import config from '../../config/config.ts';
import { SYSTEM_USER_ID } from '../../config/constants.ts';
import { dbManager } from '../db/dbInit.ts';
import { NotEnoughCreditsError } from '../error/UsageErrors.ts';
import type {
    ClubUsageAccount,
    ClubUsageAdjustment,
    ClubUsageDaily,
    UsageAction,
    UsageChargeResult,
} from '../model/UsageModels.ts';
import { UsageAction as UsageActionValues, UsageAdjustmentType } from '../model/UsageModels.ts';
import { UsageRepository } from '../repository/UsageRepository.ts';

const USAGE_ACTION_COSTS: Record<UsageAction, number> = {
    [UsageActionValues.SAVED_GAME_CREATED]: 1,
    [UsageActionValues.TRACKED_GAME_CREATED]: 2,
    [UsageActionValues.TRACKED_ROUND_RESULT_CREATED]: 2,
    [UsageActionValues.TOURNAMENT_SEATING_APPLIED]: 5,
    [UsageActionValues.TOURNAMENT_ROUND_IMPORTED]: 5,
    [UsageActionValues.CSV_GAMES_IMPORTED]: 1,
};

export interface UsageChargeRequest {
    clubId: number | null | undefined;
    action: UsageAction;
    count?: number | undefined;
    modifiedBy: number;
}

export interface UsageReservation {
    id: string;
    action: UsageAction;
    count: number;
    usageDate: string;
    modifiedBy: number;
    result: UsageChargeResult;
}

export interface UsageSummary {
    account: ClubUsageAccount;
    dailyUsage: ClubUsageDaily[];
}

export class UsageService {
    private usageRepository: UsageRepository = new UsageRepository();

    getUsageSummary(clubId: number, dateFrom?: string, dateTo?: string): UsageSummary {
        return {
            account: this.ensureAccount(clubId, SYSTEM_USER_ID),
            dailyUsage: this.usageRepository.listDailyUsage(clubId, dateFrom, dateTo),
        };
    }

    reserveCharge(request: UsageChargeRequest | undefined): Promise<UsageReservation | undefined> {
        if (request === undefined) {
            return Promise.resolve(undefined);
        }
        const normalized = this.normalizeChargeRequest(request);
        if (normalized === undefined) {
            return Promise.resolve(undefined);
        }

        return Promise.resolve(this.reserveSqliteCharge(normalized));
    }

    finalizeReservation(reservation: UsageReservation | undefined): Promise<UsageChargeResult | undefined> {
        if (reservation === undefined) {
            return Promise.resolve(undefined);
        }
        this.finalizeSqliteReservation(reservation);
        return Promise.resolve(reservation.result);
    }

    refundReservation(reservation: UsageReservation | undefined): Promise<void> {
        if (reservation === undefined) {
            return Promise.resolve();
        }
        this.usageRepository.updateBalance(
            reservation.result.clubId,
            reservation.result.chargedCredits,
            new Date(),
            reservation.modifiedBy
        );
        return Promise.resolve();
    }

    runBillable<T>(request: UsageChargeRequest, operation: () => T): T {
        const normalized = this.normalizeChargeRequest(request);
        if (normalized === undefined) {
            return operation();
        }

        const reservation = this.reserveSqliteCharge(normalized);
        try {
            const result = operation();
            this.finalizeSqliteReservation(reservation);
            return result;
        } catch (error) {
            this.usageRepository.updateBalance(
                reservation.result.clubId,
                reservation.result.chargedCredits,
                new Date(),
                reservation.modifiedBy
            );
            throw error;
        }
    }

    async adjustCredits(
        clubId: number,
        creditsDelta: number,
        reason: string,
        externalReference: string | null,
        modifiedBy: number
    ): Promise<{ account: ClubUsageAccount, adjustment: ClubUsageAdjustment }> {
        return dbManager.db.transaction(() => {
            const before = this.ensureAccount(clubId, modifiedBy);
            const after = this.usageRepository.updateBalance(clubId, creditsDelta, new Date(), modifiedBy);
            const adjustment = this.usageRepository.createAdjustment({
                clubId,
                type: UsageAdjustmentType.CREDIT_ADJUSTMENT,
                creditsDelta,
                previousCreditsBalance: before.creditsBalance,
                newCreditsBalance: after.creditsBalance,
                previousOverdraftCutoff: before.overdraftCutoff,
                newOverdraftCutoff: after.overdraftCutoff,
                reason,
                externalReference,
                createdAt: new Date(),
                createdBy: modifiedBy,
            });
            return { account: after, adjustment };
        })();
    }

    async updateOverdraftCutoff(
        clubId: number,
        overdraftCutoff: number,
        reason: string,
        externalReference: string | null,
        modifiedBy: number
    ): Promise<{ account: ClubUsageAccount, adjustment: ClubUsageAdjustment }> {
        return dbManager.db.transaction(() => {
            const before = this.ensureAccount(clubId, modifiedBy);
            const after = this.usageRepository.updateOverdraftCutoff(clubId, overdraftCutoff, new Date(), modifiedBy);
            const adjustment = this.usageRepository.createAdjustment({
                clubId,
                type: UsageAdjustmentType.OVERDRAFT_CUTOFF_UPDATE,
                creditsDelta: null,
                previousCreditsBalance: before.creditsBalance,
                newCreditsBalance: after.creditsBalance,
                previousOverdraftCutoff: before.overdraftCutoff,
                newOverdraftCutoff: after.overdraftCutoff,
                reason,
                externalReference,
                createdAt: new Date(),
                createdBy: modifiedBy,
            });
            return { account: after, adjustment };
        })();
    }

    ensureAccount(clubId: number, modifiedBy: number): ClubUsageAccount {
        return this.ensureAccountWithStartingCredits(clubId, modifiedBy, config.usageStartingCredits);
    }

    ensureNewClubAccount(clubId: number, modifiedBy: number): ClubUsageAccount {
        return this.ensureAccountWithStartingCredits(clubId, modifiedBy, config.usageNewClubStartingCredits);
    }

    private ensureAccountWithStartingCredits(
        clubId: number,
        modifiedBy: number,
        startingCredits: number
    ): ClubUsageAccount {
        const existing = this.usageRepository.findAccountByClubId(clubId);
        if (existing !== undefined) {
            return existing;
        }

        return this.usageRepository.createAccount({
            clubId,
            creditsBalance: startingCredits,
            overdraftCutoff: config.usageDefaultOverdraftCutoff,
            overdraftMultiplier: config.usageDefaultOverdraftMultiplier,
            isEnforced: true,
            createdAt: new Date(),
            modifiedBy,
        });
    }

    private normalizeChargeRequest(request: UsageChargeRequest): NormalizedUsageChargeRequest | undefined {
        if (request.clubId === null || request.clubId === undefined) {
            return undefined;
        }
        const count = request.count ?? 1;
        if (!Number.isInteger(count) || count <= 0) {
            return undefined;
        }
        const baseCredits = USAGE_ACTION_COSTS[request.action] * count;
        return { ...request, clubId: request.clubId, count, baseCredits };
    }

    private reserveSqliteCharge(request: NormalizedUsageChargeRequest): UsageReservation {
        return dbManager.db.transaction(() => {
            const account = this.ensureAccount(request.clubId, request.modifiedBy);
            const chargedCredits = this.calculateChargedCredits(account, request.baseCredits);
            const newBalance = account.creditsBalance - chargedCredits;
            if (account.isEnforced && newBalance < account.overdraftCutoff) {
                throw new NotEnoughCreditsError(
                    request.clubId,
                    account.creditsBalance,
                    account.overdraftCutoff,
                    chargedCredits
                );
            }

            const updated = this.usageRepository.updateBalance(
                request.clubId,
                -chargedCredits,
                new Date(),
                request.modifiedBy
            );

            return {
                id: `sqlite-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                action: request.action,
                count: request.count,
                usageDate: usageDateKey(new Date()),
                modifiedBy: request.modifiedBy,
                result: this.buildChargeResult(request, chargedCredits, updated),
            };
        })();
    }

    private finalizeSqliteReservation(reservation: UsageReservation): void {
        this.usageRepository.addDailyUsage({
            clubId: reservation.result.clubId,
            usageDate: reservation.usageDate,
            action: reservation.action,
            actionCount: reservation.count,
            baseCredits: reservation.result.baseCredits,
            chargedCredits: reservation.result.chargedCredits,
            modifiedAt: new Date(),
            modifiedBy: reservation.modifiedBy,
        });
    }

    private calculateChargedCredits(account: ClubUsageAccount, baseCredits: number): number {
        return account.creditsBalance < 0 ? baseCredits * account.overdraftMultiplier : baseCredits;
    }

    private buildChargeResult(
        request: NormalizedUsageChargeRequest,
        chargedCredits: number,
        account: ClubUsageAccount
    ): UsageChargeResult {
        return {
            clubId: request.clubId,
            action: request.action,
            count: request.count,
            baseCredits: request.baseCredits,
            chargedCredits,
            creditsBalance: account.creditsBalance,
            overdraftCutoff: account.overdraftCutoff,
            warning: account.creditsBalance < 0 && account.creditsBalance >= account.overdraftCutoff,
        };
    }
}

interface NormalizedUsageChargeRequest extends UsageChargeRequest {
    clubId: number;
    count: number;
    baseCredits: number;
}

function usageDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}
