import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { EventRegistration, EventRegistrationStatus } from '../model/EventRegistrationModels.ts';
import { parseEventRegistrationStatus } from '../util/EnumUtil.ts';

const REGISTRATION_SELECT_COLUMNS = `
    er.eventId,
    e.name as eventName,
    er.userId,
    u.name as userName,
    p.firstName as firstName,
    p.lastName as lastName,
    er.status,
    er.createdAt,
    er.modifiedAt,
    er.modifiedBy
`;

const REGISTRATION_FROM_JOIN = `
    FROM eventRegistration er
    JOIN event e ON er.eventId = e.id
    JOIN user u ON er.userId = u.id
    LEFT JOIN profile p ON p.userId = er.userId
`;

export class EventRegistrationRepository {

    private findRegistrationStatement(): Statement<{ eventId: number; userId: number }, EventRegistrationDBEntity> {
        return dbManager.db.prepare(`
            SELECT ${REGISTRATION_SELECT_COLUMNS}
            ${REGISTRATION_FROM_JOIN}
            WHERE er.eventId = :eventId
              AND er.userId = :userId
        `);
    }

    findRegistration(eventId: number, userId: number): EventRegistration | undefined {
        const dbEntity = this.findRegistrationStatement().get({ eventId, userId });
        return dbEntity !== undefined ? eventRegistrationFromDBEntity(dbEntity) : undefined;
    }

    private findRegistrationsByEventIdStatement(): Statement<{ eventId: number }, EventRegistrationDBEntity> {
        return dbManager.db.prepare(`
            SELECT ${REGISTRATION_SELECT_COLUMNS}
            ${REGISTRATION_FROM_JOIN}
            WHERE er.eventId = :eventId
            ORDER BY er.createdAt
        `);
    }

    findRegistrationsByEventId(eventId: number): EventRegistration[] {
        return this.findRegistrationsByEventIdStatement().all({ eventId }).map(eventRegistrationFromDBEntity);
    }

    private findRegistrationsByEventIdAndStatusStatement(): Statement<{ eventId: number; status: EventRegistrationStatus }, EventRegistrationDBEntity> {
        return dbManager.db.prepare(`
            SELECT ${REGISTRATION_SELECT_COLUMNS}
            ${REGISTRATION_FROM_JOIN}
            WHERE er.eventId = :eventId
              AND er.status = :status
            ORDER BY er.createdAt
        `);
    }

    findRegistrationsByEventIdAndStatus(eventId: number, status: EventRegistrationStatus): EventRegistration[] {
        return this.findRegistrationsByEventIdAndStatusStatement().all({ eventId, status }).map(eventRegistrationFromDBEntity);
    }

    private findRegistrationsByUserIdStatement(): Statement<{ userId: number }, EventRegistrationDBEntity> {
        return dbManager.db.prepare(`
            SELECT ${REGISTRATION_SELECT_COLUMNS}
            ${REGISTRATION_FROM_JOIN}
            WHERE er.userId = :userId
            ORDER BY er.createdAt DESC
        `);
    }

    findRegistrationsByUserId(userId: number): EventRegistration[] {
        return this.findRegistrationsByUserIdStatement().all({ userId }).map(eventRegistrationFromDBEntity);
    }

    private findRegistrationsByUserIdAndStatusStatement(): Statement<{ userId: number; status: EventRegistrationStatus }, EventRegistrationDBEntity> {
        return dbManager.db.prepare(`
            SELECT ${REGISTRATION_SELECT_COLUMNS}
            ${REGISTRATION_FROM_JOIN}
            WHERE er.userId = :userId
              AND er.status = :status
            ORDER BY er.createdAt DESC
        `);
    }

    findRegistrationsByUserIdAndStatus(userId: number, status: EventRegistrationStatus): EventRegistration[] {
        return this.findRegistrationsByUserIdAndStatusStatement().all({ userId, status }).map(eventRegistrationFromDBEntity);
    }

    private createRegistrationStatement(): Statement<{
        eventId: number;
        userId: number;
        status: EventRegistrationStatus;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
            VALUES (:eventId, :userId, :status, :createdAt, :modifiedAt, :modifiedBy)
        `);
    }

    createRegistration(params: EventRegistrationCreateParams): void {
        this.createRegistrationStatement().run({
            ...params,
            createdAt: params.createdAt.toISOString(),
            modifiedAt: params.modifiedAt.toISOString()
        });
    }

    private updateRegistrationStatusStatement(): Statement<{
        eventId: number;
        userId: number;
        status: EventRegistrationStatus;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE eventRegistration
            SET status = :status,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE eventId = :eventId
              AND userId = :userId
        `);
    }

    updateRegistrationStatus(eventId: number, userId: number, status: EventRegistrationStatus, modifiedBy: number): void {
        this.updateRegistrationStatusStatement().run({
            eventId,
            userId,
            status,
            modifiedAt: new Date().toISOString(),
            modifiedBy
        });
    }

    private deleteRegistrationStatement(): Statement<{ eventId: number; userId: number }, void> {
        return dbManager.db.prepare(`
            DELETE FROM eventRegistration
            WHERE eventId = :eventId
              AND userId = :userId
        `);
    }

    deleteRegistration(eventId: number, userId: number): void {
        this.deleteRegistrationStatement().run({ eventId, userId });
    }

    private countApprovedByEventIdStatement(): Statement<{ eventId: number }, { count: number }> {
        return dbManager.db.prepare(`
            SELECT COUNT(*) as count
            FROM eventRegistration
            WHERE eventId = :eventId
              AND status = 'APPROVED'
        `);
    }

    countApprovedByEventId(eventId: number): number {
        return this.countApprovedByEventIdStatement().get({ eventId })!.count;
    }

    private countRegistrationsByEventIdStatement(): Statement<{ eventId: number }, { count: number }> {
        return dbManager.db.prepare(`
            SELECT COUNT(*) as count
            FROM eventRegistration
            WHERE eventId = :eventId
        `);
    }

    countRegistrationsByEventId(eventId: number): number {
        return this.countRegistrationsByEventIdStatement().get({ eventId })!.count;
    }
}

export interface EventRegistrationCreateParams {
    eventId: number;
    userId: number;
    status: EventRegistrationStatus;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

interface EventRegistrationDBEntity {
    eventId: number;
    eventName: string;
    userId: number;
    userName: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

function eventRegistrationFromDBEntity(dbEntity: EventRegistrationDBEntity): EventRegistration {
    return {
        eventId: dbEntity.eventId,
        eventName: dbEntity.eventName,
        userId: dbEntity.userId,
        userName: dbEntity.userName,
        firstName: dbEntity.firstName,
        lastName: dbEntity.lastName,
        status: parseEventRegistrationStatus(dbEntity.status),
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}
