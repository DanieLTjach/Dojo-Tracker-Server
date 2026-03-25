import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import { booleanToInteger } from '../db/dbUtils.ts';
import type { Event } from '../model/EventModels.ts';
import { parseUma } from '../util/UmaUtil.ts';

export class EventRepository {
    private findAllEventsStatement(): Statement<[], EventWithGameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                e.*,

                gr.id as gr_id,
                gr.name as gr_name,
                gr.clubId as gr_clubId,
                gr.numberOfPlayers as gr_numberOfPlayers,
                gr.uma as gr_uma,
                gr.startingPoints as gr_startingPoints,
                gr.startingRating as gr_startingRating,
                gr.minimumGamesForRating as gr_minimumGamesForRating,
                gr.chomboPointsAfterUma as gr_chomboPointsAfterUma,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            ORDER BY e.createdAt DESC`
        );
    }

    findAllEvents(): Event[] {
        return this.findAllEventsStatement().all().map(eventWithGameRulesFromDBEntity);
    }

    private findAllEventsByClubIdStatement(): Statement<{ clubId: number }, EventWithGameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                e.*,

                gr.id as gr_id,
                gr.name as gr_name,
                gr.clubId as gr_clubId,
                gr.numberOfPlayers as gr_numberOfPlayers,
                gr.uma as gr_uma,
                gr.startingPoints as gr_startingPoints,
                gr.startingRating as gr_startingRating,
                gr.minimumGamesForRating as gr_minimumGamesForRating,
                gr.chomboPointsAfterUma as gr_chomboPointsAfterUma,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            WHERE e.clubId = :clubId OR e.clubId IS NULL
            ORDER BY e.createdAt DESC`
        );
    }

    findAllEventsByClubId(clubId: number): Event[] {
        return this.findAllEventsByClubIdStatement().all({ clubId }).map(eventWithGameRulesFromDBEntity);
    }

    private findEventByIdStatement(): Statement<{ id: number }, EventWithGameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                e.*,

                gr.id as gr_id,
                gr.name as gr_name,
                gr.clubId as gr_clubId,
                gr.numberOfPlayers as gr_numberOfPlayers,
                gr.uma as gr_uma,
                gr.startingPoints as gr_startingPoints,
                gr.startingRating as gr_startingRating,
                gr.minimumGamesForRating as gr_minimumGamesForRating,
                gr.chomboPointsAfterUma as gr_chomboPointsAfterUma,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            WHERE e.id = :id`
        );
    }

    findEventById(eventId: number): Event | undefined {
        const eventDBEntity = this.findEventByIdStatement().get({ id: eventId });
        return eventDBEntity !== undefined ? eventWithGameRulesFromDBEntity(eventDBEntity) : undefined;
    }

    private createEventStatement(): Statement<{
        name: string;
        description: string | null;
        type: string;
        gameRules: number;
        clubId: number | null;
        isCurrentRating: number;
        dateFrom: string | null;
        dateTo: string | null;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO event (name, description, type, gameRules, clubId, isCurrentRating, dateFrom, dateTo, createdAt, modifiedAt, modifiedBy)
            VALUES (:name, :description, :type, :gameRules, :clubId, :isCurrentRating, :dateFrom, :dateTo, :createdAt, :modifiedAt, :modifiedBy)
            RETURNING id
        `);
    }

    createEvent(params: EventCreateParams): number {
        const result = this.createEventStatement().get({
            ...params,
            isCurrentRating: booleanToInteger(params.isCurrentRating),
            dateFrom: params.dateFrom?.toISOString() ?? null,
            dateTo: params.dateTo?.toISOString() ?? null,
            createdAt: params.createdAt.toISOString(),
            modifiedAt: params.modifiedAt.toISOString()
        });
        return result!.id;
    }

    private updateEventStatement(): Statement<{
        id: number;
        name: string;
        description: string | null;
        type: string;
        gameRules: number;
        clubId: number | null;
        isCurrentRating: number;
        dateFrom: string | null;
        dateTo: string | null;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE event
            SET name = :name,
                description = :description,
                type = :type,
                gameRules = :gameRules,
                clubId = :clubId,
                isCurrentRating = :isCurrentRating,
                dateFrom = :dateFrom,
                dateTo = :dateTo,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE id = :id
        `);
    }

    updateEvent(params: EventUpdateParams): void {
        this.updateEventStatement().run({
            ...params,
            isCurrentRating: booleanToInteger(params.isCurrentRating),
            dateFrom: params.dateFrom?.toISOString() ?? null,
            dateTo: params.dateTo?.toISOString() ?? null,
            modifiedAt: params.modifiedAt.toISOString()
        });
    }

    private findCurrentRatingEventByClubIdStatement(): Statement<{ clubId: number }, EventWithGameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                e.*,

                gr.id as gr_id,
                gr.name as gr_name,
                gr.clubId as gr_clubId,
                gr.numberOfPlayers as gr_numberOfPlayers,
                gr.uma as gr_uma,
                gr.startingPoints as gr_startingPoints,
                gr.startingRating as gr_startingRating,
                gr.minimumGamesForRating as gr_minimumGamesForRating,
                gr.chomboPointsAfterUma as gr_chomboPointsAfterUma,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            WHERE e.clubId = :clubId AND e.isCurrentRating = 1
            LIMIT 1`
        );
    }

    findCurrentRatingEventByClubId(clubId: number): Event | undefined {
        const eventDBEntity = this.findCurrentRatingEventByClubIdStatement().get({ clubId });
        return eventDBEntity !== undefined ? eventWithGameRulesFromDBEntity(eventDBEntity) : undefined;
    }

    private clearCurrentRatingEventByClubIdStatement(): Statement<{ clubId: number; excludedEventId: number | null }, void> {
        return dbManager.db.prepare(`
            UPDATE event
            SET isCurrentRating = 0
            WHERE clubId = :clubId
              AND isCurrentRating = 1
              AND (:excludedEventId IS NULL OR id != :excludedEventId)
        `);
    }

    clearCurrentRatingEventByClubId(clubId: number, excludedEventId?: number): void {
        this.clearCurrentRatingEventByClubIdStatement().run({
            clubId,
            excludedEventId: excludedEventId ?? null
        });
    }

    private deleteEventStatement(): Statement<{ id: number }, void> {
        return dbManager.db.prepare(`
            DELETE FROM event WHERE id = :id
        `);
    }

    deleteEvent(eventId: number): void {
        this.deleteEventStatement().run({ id: eventId });
    }

    private getGameCountForEventStatement(): Statement<{ eventId: number }, { count: number }> {
        return dbManager.db.prepare(`
            SELECT COUNT(*) as count FROM game WHERE eventId = :eventId
        `);
    }

    getGameCountForEvent(eventId: number): number {
        const result = this.getGameCountForEventStatement().get({ eventId });
        return result!.count;
    }

    gameRulesExists(gameRulesId: number): boolean {
        const result = dbManager.db.prepare(`SELECT 1 FROM gameRules WHERE id = ?`).get(gameRulesId);
        return result !== undefined;
    }
}

export interface EventCreateParams {
    name: string;
    description: string | null;
    type: string;
    gameRules: number;
    clubId: number | null;
    isCurrentRating: boolean;
    dateFrom: Date | null;
    dateTo: Date | null;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface EventUpdateParams {
    id: number;
    name: string;
    description: string | null;
    type: string;
    gameRules: number;
    clubId: number | null;
    isCurrentRating: boolean;
    dateFrom: Date | null;
    dateTo: Date | null;
    modifiedAt: Date;
    modifiedBy: number;
}

interface EventWithGameRulesDBEntity {
    id: number;
    name: string;
    description: string | null;
    type: string;
    gameRules: number;
    clubId: number | null;
    isCurrentRating: number;
    dateFrom: string | null;
    dateTo: string | null;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
    gr_id: number;
    gr_name: string;
    gr_clubId: number | null;
    gr_numberOfPlayers: number;
    gr_uma: string;
    gr_startingPoints: number;
    gr_startingRating: number;
    gr_minimumGamesForRating: number;
    gr_chomboPointsAfterUma: number | null;
    gameCount: number;
}

function eventWithGameRulesFromDBEntity(dbEntity: EventWithGameRulesDBEntity): Event {
    return {
        id: dbEntity.id,
        name: dbEntity.name,
        description: dbEntity.description,
        type: dbEntity.type,
        clubId: dbEntity.clubId,
        isCurrentRating: dbEntity.isCurrentRating === 1,
        gameRules: {
            id: dbEntity.gr_id,
            name: dbEntity.gr_name,
            clubId: dbEntity.gr_clubId,
            numberOfPlayers: dbEntity.gr_numberOfPlayers,
            uma: parseUma(dbEntity.gr_uma),
            startingPoints: dbEntity.gr_startingPoints,
            startingRating: dbEntity.gr_startingRating,
            minimumGamesForRating: dbEntity.gr_minimumGamesForRating,
            chomboPointsAfterUma: dbEntity.gr_chomboPointsAfterUma
        },
        dateFrom: dbEntity.dateFrom !== null ? new Date(dbEntity.dateFrom) : null,
        dateTo: dbEntity.dateTo !== null ? new Date(dbEntity.dateTo) : null,
        gameCount: dbEntity.gameCount,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}
