import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { ClubPollConfig } from '../model/PollModels.ts';
import { booleanToInteger } from '../db/dbUtils.ts';

export class PollRepository {
    private findAllActiveConfigsStatement(): Statement<[], PollConfigDBEntity> {
        return dbManager.db.prepare(`
            SELECT clubId, pollTitle, eventDays, sendDay, sendTime, extraOptions, isActive
            FROM clubPollConfig
            WHERE isActive = 1
        `);
    }

    findAllActiveConfigs(): ClubPollConfig[] {
        return this.findAllActiveConfigsStatement().all().map(pollConfigFromDBEntity);
    }

    private findConfigByClubIdStatement(): Statement<{ clubId: number }, PollConfigDBEntity> {
        return dbManager.db.prepare(`
            SELECT clubId, pollTitle, eventDays, sendDay, sendTime, extraOptions, isActive
            FROM clubPollConfig
            WHERE clubId = :clubId
        `);
    }

    findConfigByClubId(clubId: number): ClubPollConfig | undefined {
        const dbEntity = this.findConfigByClubIdStatement().get({ clubId });
        return dbEntity !== undefined ? pollConfigFromDBEntity(dbEntity) : undefined;
    }

    private upsertConfigStatement(): Statement<{
        clubId: number;
        pollTitle: string;
        eventDays: string;
        sendDay: number;
        sendTime: string;
        extraOptions: string | null;
        isActive: number;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO clubPollConfig (clubId, pollTitle, eventDays, sendDay, sendTime, extraOptions, isActive, createdAt, modifiedAt, modifiedBy)
            VALUES (:clubId, :pollTitle, :eventDays, :sendDay, :sendTime, :extraOptions, :isActive, :modifiedAt, :modifiedAt, :modifiedBy)
            ON CONFLICT(clubId) DO UPDATE SET
                pollTitle = :pollTitle,
                eventDays = :eventDays,
                sendDay = :sendDay,
                sendTime = :sendTime,
                extraOptions = :extraOptions,
                isActive = :isActive,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
        `);
    }

    upsertConfig(config: ClubPollConfig, modifiedBy: number): void {
        this.upsertConfigStatement().run({
            clubId: config.clubId,
            pollTitle: config.pollTitle,
            eventDays: JSON.stringify(config.eventDays),
            sendDay: config.sendDay,
            sendTime: config.sendTime,
            extraOptions: config.extraOptions.length > 0 ? JSON.stringify(config.extraOptions) : null,
            isActive: booleanToInteger(config.isActive),
            modifiedAt: new Date().toISOString(),
            modifiedBy
        });
    }
}

interface PollConfigDBEntity {
    clubId: number;
    pollTitle: string;
    eventDays: string;
    sendDay: number;
    sendTime: string;
    extraOptions: string | null;
    isActive: number;
}

function pollConfigFromDBEntity(dbEntity: PollConfigDBEntity): ClubPollConfig {
    return {
        clubId: dbEntity.clubId,
        pollTitle: dbEntity.pollTitle,
        eventDays: JSON.parse(dbEntity.eventDays),
        sendDay: dbEntity.sendDay,
        sendTime: dbEntity.sendTime,
        extraOptions: dbEntity.extraOptions ? JSON.parse(dbEntity.extraOptions) : [],
        isActive: Boolean(dbEntity.isActive)
    };
}
