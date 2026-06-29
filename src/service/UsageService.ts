import cron from 'node-cron';
import { createClient } from 'redis';
import config from '../../config/config.ts';
import { SYSTEM_USER_ID } from '../../config/constants.ts';
import { dbManager } from '../db/dbInit.ts';
import { NotEnoughCreditsError } from '../error/UsageErrors.ts';
import { UsageRepository } from '../repository/UsageRepository.ts';
import type {
    ClubUsageAccount,
    ClubUsageAdjustment,
    ClubUsageDaily,
    UsageAction,
    UsageChargeResult,
} from '../model/UsageModels.ts';
import { UsageAction as UsageActionValues, UsageAdjustmentType } from '../model/UsageModels.ts';
import LogService from './LogService.ts';

const USAGE_ACTION_COSTS: Record<UsageAction, number> = {
    [UsageActionValues.EVENT_CREATED]: 1,
    [UsageActionValues.TOURNAMENT_CREATED]: 1,
    [UsageActionValues.SAVED_GAME_CREATED]: 1,
    [UsageActionValues.TRACKED_GAME_CREATED]: 1,
    [UsageActionValues.TRACKED_ROUND_RESULT_CREATED]: 1,
    [UsageActionValues.TOURNAMENT_SEATING_GENERATED]: 1,
    [UsageActionValues.TOURNAMENT_SEATING_APPLIED]: 1,
    [UsageActionValues.TOURNAMENT_ROUND_IMPORTED]: 1,
    [UsageActionValues.CSV_GAMES_IMPORTED]: 1,
    [UsageActionValues.CLUB_USER_ADDED]: 1,
    [UsageActionValues.GAME_RULES_CREATED]: 1,
    [UsageActionValues.TEAM_CREATED]: 1,
};

type RedisClient = any;

export interface UsageChargeRequest {
    clubId: number | null | undefined;
    action: UsageAction;
    count?: number | undefined;
    modifiedBy: number;
}

export interface UsageReservation {
    id: string;
    kind: 'redis' | 'sqlite';
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
    private static redisClient: RedisClient | undefined;
    private static redisConnectPromise: Promise<RedisClient> | undefined;
    private static schedulerStarted = false;

    private usageRepository: UsageRepository = new UsageRepository();

    static initScheduler(): void {
        if (this.schedulerStarted || config.redisUrl === undefined) {
            return;
        }
        this.schedulerStarted = true;
        cron.schedule(config.usageFlushCron, () => {
            void new UsageService().flushPendingUsage();
        });
    }

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

        return this.reserveChargeInternal(normalized);
    }

    finalizeReservation(reservation: UsageReservation | undefined): Promise<UsageChargeResult | undefined> {
        if (reservation === undefined) {
            return Promise.resolve(undefined);
        }
        if (reservation.kind === 'sqlite') {
            this.finalizeSqliteReservation(reservation);
            return Promise.resolve(reservation.result);
        }
        return this.finalizeRedisReservation(reservation);
    }

    refundReservation(reservation: UsageReservation | undefined): Promise<void> {
        if (reservation === undefined) {
            return Promise.resolve();
        }
        if (reservation.kind === 'sqlite') {
            this.usageRepository.updateBalance(
                reservation.result.clubId,
                reservation.result.chargedCredits,
                new Date(),
                reservation.modifiedBy
            );
            return Promise.resolve();
        }
        return this.refundRedisReservation(reservation);
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
        if (config.redisUrl !== undefined) {
            try {
                return await this.adjustCreditsWithRedis(clubId, creditsDelta, reason, externalReference, modifiedBy);
            } catch (error) {
                LogService.logError(
                    `Usage credits Redis adjustment failed for club ${clubId}, falling back to SQLite`,
                    error
                );
            }
        }

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
        if (config.redisUrl !== undefined) {
            try {
                await this.ensureRedisLiveBalance(this.ensureAccount(clubId, modifiedBy));
            } catch (error) {
                LogService.logError(
                    `Usage credits Redis cutoff sync failed for club ${clubId}, falling back to SQLite`,
                    error
                );
            }
        }

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

    async flushPendingUsage(): Promise<void> {
        if (config.redisUrl === undefined) {
            return;
        }

        let client: RedisClient;
        try {
            client = await UsageService.getRedisClient();
        } catch (error) {
            LogService.logError('Unable to connect to Redis for usage flush', error);
            return;
        }

        await this.flushLiveBalances(client);
        await this.flushDailyUsage(client);
    }

    ensureAccount(clubId: number, modifiedBy: number): ClubUsageAccount {
        const existing = this.usageRepository.findAccountByClubId(clubId);
        if (existing !== undefined) {
            return existing;
        }

        return this.usageRepository.createAccount({
            clubId,
            creditsBalance: config.usageStartingCredits,
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

    private async reserveChargeInternal(request: NormalizedUsageChargeRequest): Promise<UsageReservation> {
        if (config.redisUrl !== undefined) {
            try {
                return await this.reserveRedisCharge(request);
            } catch (error) {
                LogService.logError(
                    `Usage credits Redis reserve failed for club ${request.clubId}, falling back to SQLite`,
                    error
                );
            }
        }
        return this.reserveSqliteCharge(request);
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
                kind: 'sqlite' as const,
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

    private async reserveRedisCharge(request: NormalizedUsageChargeRequest): Promise<UsageReservation> {
        const account = this.ensureAccount(request.clubId, request.modifiedBy);
        const client = await UsageService.getRedisClient();
        const reservationId = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`;
        const result = await client.eval(RESERVE_SCRIPT, {
            keys: [liveBalanceKey(request.clubId), reservationKey(reservationId)],
            arguments: [
                String(account.creditsBalance),
                String(account.overdraftCutoff),
                String(account.overdraftMultiplier),
                account.isEnforced ? '1' : '0',
                String(request.baseCredits),
                String(config.usageReservationTtlSeconds),
                String(request.clubId),
                request.action,
                String(request.count),
            ],
        }) as [number, number, number, number];

        const [allowed, previousBalance, newBalance, chargedCredits] = result;
        if (allowed !== 1) {
            throw new NotEnoughCreditsError(request.clubId, previousBalance, account.overdraftCutoff, chargedCredits);
        }

        return {
            id: reservationId,
            kind: 'redis',
            action: request.action,
            count: request.count,
            usageDate: usageDateKey(new Date()),
            modifiedBy: request.modifiedBy,
            result: {
                clubId: request.clubId,
                action: request.action,
                count: request.count,
                baseCredits: request.baseCredits,
                chargedCredits,
                creditsBalance: newBalance,
                overdraftCutoff: account.overdraftCutoff,
                warning: newBalance < 0 && newBalance >= account.overdraftCutoff,
            },
        };
    }

    private async finalizeRedisReservation(reservation: UsageReservation): Promise<UsageChargeResult> {
        try {
            const client = await UsageService.getRedisClient();
            const pendingKey = dailyPendingKey(reservation.usageDate, reservation.result.clubId, reservation.action);
            await client
                .multi()
                .hIncrBy(pendingKey, 'actionCount', reservation.count)
                .hIncrBy(pendingKey, 'baseCredits', reservation.result.baseCredits)
                .hIncrBy(pendingKey, 'chargedCredits', reservation.result.chargedCredits)
                .expire(pendingKey, 86400)
                .del(reservationKey(reservation.id))
                .exec();
        } catch (error) {
            LogService.logError(
                `Usage credits Redis finalize failed for club ${reservation.result.clubId}, persisting directly to SQLite`,
                error
            );
            this.usageRepository.setBalance(
                reservation.result.clubId,
                reservation.result.creditsBalance,
                new Date(),
                reservation.modifiedBy
            );
            this.finalizeSqliteReservation(reservation);
        }
        return reservation.result;
    }

    private async refundRedisReservation(reservation: UsageReservation): Promise<void> {
        try {
            const client = await UsageService.getRedisClient();
            await client
                .multi()
                .incrBy(liveBalanceKey(reservation.result.clubId), reservation.result.chargedCredits)
                .del(reservationKey(reservation.id))
                .exec();
        } catch (error) {
            LogService.logError(`Usage credits Redis refund failed for club ${reservation.result.clubId}`, error);
        }
    }

    private async adjustCreditsWithRedis(
        clubId: number,
        creditsDelta: number,
        reason: string,
        externalReference: string | null,
        modifiedBy: number
    ): Promise<{ account: ClubUsageAccount, adjustment: ClubUsageAdjustment }> {
        const account = this.ensureAccount(clubId, modifiedBy);
        const client = await UsageService.getRedisClient();
        const result = await client.eval(ADJUST_SCRIPT, {
            keys: [liveBalanceKey(clubId)],
            arguments: [String(account.creditsBalance), String(creditsDelta)],
        }) as [number, number];
        const [previousBalance, newBalance] = result;

        return dbManager.db.transaction(() => {
            const after = this.usageRepository.setBalance(clubId, newBalance, new Date(), modifiedBy);
            const adjustment = this.usageRepository.createAdjustment({
                clubId,
                type: UsageAdjustmentType.CREDIT_ADJUSTMENT,
                creditsDelta,
                previousCreditsBalance: previousBalance,
                newCreditsBalance: newBalance,
                previousOverdraftCutoff: account.overdraftCutoff,
                newOverdraftCutoff: account.overdraftCutoff,
                reason,
                externalReference,
                createdAt: new Date(),
                createdBy: modifiedBy,
            });
            return { account: after, adjustment };
        })();
    }

    private async ensureRedisLiveBalance(account: ClubUsageAccount): Promise<void> {
        const client = await UsageService.getRedisClient();
        await client.eval(ENSURE_BALANCE_SCRIPT, {
            keys: [liveBalanceKey(account.clubId)],
            arguments: [String(account.creditsBalance)],
        });
    }

    private async flushLiveBalances(client: RedisClient): Promise<void> {
        const keys = await scanKeys(client, 'usage:balance:*');
        for (const key of keys) {
            const clubId = Number(key.split(':')[2]);
            if (!Number.isInteger(clubId)) {
                continue;
            }
            const balance = await client.get(key);
            if (balance === null) {
                continue;
            }
            this.ensureAccount(clubId, SYSTEM_USER_ID);
            this.usageRepository.setBalance(clubId, Number(balance), new Date(), SYSTEM_USER_ID);
        }
    }

    private async flushDailyUsage(client: RedisClient): Promise<void> {
        const keys = await scanKeys(client, 'usage:pending:*');
        for (const key of keys) {
            const parts = key.split(':');
            const usageDate = parts[2];
            const clubId = Number(parts[3]);
            const action = parts[4] as UsageAction | undefined;
            if (usageDate === undefined || action === undefined || !Number.isInteger(clubId)) {
                continue;
            }

            const values = await client.hGetAll(key);
            const actionCount = Number(values['actionCount'] ?? 0);
            const baseCredits = Number(values['baseCredits'] ?? 0);
            const chargedCredits = Number(values['chargedCredits'] ?? 0);
            if (actionCount <= 0 && baseCredits <= 0 && chargedCredits <= 0) {
                await client.del(key);
                continue;
            }

            this.usageRepository.addDailyUsage({
                clubId,
                usageDate,
                action,
                actionCount,
                baseCredits,
                chargedCredits,
                modifiedAt: new Date(),
                modifiedBy: SYSTEM_USER_ID,
            });
            await client.del(key);
        }
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

    private static async getRedisClient(): Promise<RedisClient> {
        if (config.redisUrl === undefined) {
            throw new Error('REDIS_URL is not configured');
        }
        if (this.redisClient !== undefined) {
            return this.redisClient;
        }
        if (this.redisConnectPromise !== undefined) {
            return this.redisConnectPromise;
        }

        const client = createClient({ url: config.redisUrl });
        client.on('error', error => {
            LogService.logError('Redis usage client error', error);
        });
        this.redisConnectPromise = client.connect().then(() => {
            this.redisClient = client;
            return client;
        }).catch(error => {
            this.redisClient = undefined;
            this.redisConnectPromise = undefined;
            throw error;
        });
        return this.redisConnectPromise;
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

function liveBalanceKey(clubId: number): string {
    return `usage:balance:${clubId}`;
}

function reservationKey(id: string): string {
    return `usage:reservation:${id}`;
}

function dailyPendingKey(usageDate: string, clubId: number, action: UsageAction): string {
    return `usage:pending:${usageDate}:${clubId}:${action}`;
}

async function scanKeys(client: RedisClient, match: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
        const result = await client.scan(cursor, { MATCH: match, COUNT: 100 }) as unknown as {
            cursor: string;
            keys: string[];
        };
        cursor = result.cursor;
        keys.push(...result.keys);
    } while (cursor !== '0');
    return keys;
}

const ENSURE_BALANCE_SCRIPT = `
    if redis.call('EXISTS', KEYS[1]) == 0 then
        redis.call('SET', KEYS[1], ARGV[1])
    end
    return redis.call('GET', KEYS[1])
`;

const RESERVE_SCRIPT = `
    if redis.call('EXISTS', KEYS[1]) == 0 then
        redis.call('SET', KEYS[1], ARGV[1])
    end

    local balance = tonumber(redis.call('GET', KEYS[1]))
    local cutoff = tonumber(ARGV[2])
    local multiplier = tonumber(ARGV[3])
    local is_enforced = tonumber(ARGV[4])
    local base_credits = tonumber(ARGV[5])
    local ttl_seconds = tonumber(ARGV[6])
    local charged_credits = base_credits

    if balance < 0 then
        charged_credits = base_credits * multiplier
    end

    local new_balance = balance - charged_credits
    if is_enforced == 1 and new_balance < cutoff then
        return {0, balance, new_balance, charged_credits}
    end

    redis.call('SET', KEYS[1], new_balance)
    redis.call('HSET', KEYS[2],
        'clubId', ARGV[7],
        'action', ARGV[8],
        'count', ARGV[9],
        'baseCredits', base_credits,
        'chargedCredits', charged_credits
    )
    redis.call('EXPIRE', KEYS[2], ttl_seconds)
    return {1, balance, new_balance, charged_credits}
`;

const ADJUST_SCRIPT = `
    if redis.call('EXISTS', KEYS[1]) == 0 then
        redis.call('SET', KEYS[1], ARGV[1])
    end
    local previous_balance = tonumber(redis.call('GET', KEYS[1]))
    local new_balance = previous_balance + tonumber(ARGV[2])
    redis.call('SET', KEYS[1], new_balance)
    return {previous_balance, new_balance}
`;
