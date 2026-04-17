import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { Event, GameRulesDetails } from '../model/EventModels.ts';
import { parseUma } from '../util/UmaUtil.ts';
import { parseUmaTieBreak } from '../util/EnumUtil.ts';
import { parseStoredGameRulesDetails } from '../util/GameRulesDetailsUtil.ts';

export class EventRepository {
    private findAllEventsStatement(): Statement<[], EventWithGameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                e.*,
                CASE WHEN c.currentRatingEventId = e.id THEN 1 ELSE 0 END as isCurrentRating,

                gr.id as gr_id,
                gr.name as gr_name,
                gr.clubId as gr_clubId,
                gr.numberOfPlayers as gr_numberOfPlayers,
                gr.uma as gr_uma,
                gr.startingPoints as gr_startingPoints,
                gr.chomboPointsAfterUma as gr_chomboPointsAfterUma,
                gr.umaTieBreak as gr_umaTieBreak,
                gr.details as gr_details,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            LEFT JOIN club c ON e.clubId = c.id
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
                CASE WHEN c.currentRatingEventId = e.id THEN 1 ELSE 0 END as isCurrentRating,

                gr.id as gr_id,
                gr.name as gr_name,
                gr.clubId as gr_clubId,
                gr.numberOfPlayers as gr_numberOfPlayers,
                gr.uma as gr_uma,
                gr.startingPoints as gr_startingPoints,
                gr.chomboPointsAfterUma as gr_chomboPointsAfterUma,
                gr.umaTieBreak as gr_umaTieBreak,
                gr.details as gr_details,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            LEFT JOIN club c ON e.clubId = c.id
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
                CASE WHEN c.currentRatingEventId = e.id THEN 1 ELSE 0 END as isCurrentRating,

                gr.id as gr_id,
                gr.name as gr_name,
                gr.clubId as gr_clubId,
                gr.numberOfPlayers as gr_numberOfPlayers,
                gr.uma as gr_uma,
                gr.startingPoints as gr_startingPoints,
                gr.chomboPointsAfterUma as gr_chomboPointsAfterUma,
                gr.umaTieBreak as gr_umaTieBreak,
                gr.details as gr_details,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            LEFT JOIN club c ON e.clubId = c.id
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
        dateFrom: string | null;
        dateTo: string | null;
        startingRating: number;
        minimumGamesForRating: number;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO event (name, description, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
            VALUES (:name, :description, :type, :gameRules, :clubId, :dateFrom, :dateTo, :startingRating, :minimumGamesForRating, :createdAt, :modifiedAt, :modifiedBy)
            RETURNING id
        `);
    }

    createEvent(params: EventCreateParams): number {
        const result = this.createEventStatement().get({
            ...params,
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
        dateFrom: string | null;
        dateTo: string | null;
        startingRating: number;
        minimumGamesForRating: number;
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
                dateFrom = :dateFrom,
                dateTo = :dateTo,
                startingRating = :startingRating,
                minimumGamesForRating = :minimumGamesForRating,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE id = :id
        `);
    }

    updateEvent(params: EventUpdateParams): void {
        this.updateEventStatement().run({
            ...params,
            dateFrom: params.dateFrom?.toISOString() ?? null,
            dateTo: params.dateTo?.toISOString() ?? null,
            modifiedAt: params.modifiedAt.toISOString()
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

    private countEventsByGameRulesIdStatement(): Statement<{ gameRulesId: number }, { count: number }> {
        return dbManager.db.prepare(`
            SELECT COUNT(*) as count FROM event WHERE gameRules = :gameRulesId
        `);
    }

    countEventsByGameRulesId(gameRulesId: number): number {
        return this.countEventsByGameRulesIdStatement().get({ gameRulesId })!.count;
    }
}

export interface EventCreateParams {
    name: string;
    description: string | null;
    type: string;
    gameRules: number;
    clubId: number | null;
    dateFrom: Date | null;
    dateTo: Date | null;
    startingRating: number;
    minimumGamesForRating: number;
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
    dateFrom: Date | null;
    dateTo: Date | null;
    startingRating: number;
    minimumGamesForRating: number;
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
    startingRating: number;
    minimumGamesForRating: number;
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
    gr_chomboPointsAfterUma: number | null;
    gr_umaTieBreak: string;
    gr_details: string | null;
    gameCount: number;
}

function eventWithGameRulesFromDBEntity(dbEntity: EventWithGameRulesDBEntity): Event {
    return {
        id: dbEntity.id,
        name: dbEntity.name,
        description: dbEntity.description,
        type: dbEntity.type,
        clubId: dbEntity.clubId,
        isCurrentRating: Boolean(dbEntity.isCurrentRating),
        startingRating: dbEntity.startingRating,
        minimumGamesForRating: dbEntity.minimumGamesForRating,
        gameRules: {
            id: dbEntity.gr_id,
            name: dbEntity.gr_name,
            clubId: dbEntity.gr_clubId,
            numberOfPlayers: dbEntity.gr_numberOfPlayers,
            uma: parseUma(dbEntity.gr_uma),
            startingPoints: dbEntity.gr_startingPoints,
            chomboPointsAfterUma: dbEntity.gr_chomboPointsAfterUma,
            umaTieBreak: parseUmaTieBreak(dbEntity.gr_umaTieBreak),
            details: parseGameRulesDetails(dbEntity.gr_details)
        },
        dateFrom: dbEntity.dateFrom !== null ? new Date(dbEntity.dateFrom) : null,
        dateTo: dbEntity.dateTo !== null ? new Date(dbEntity.dateTo) : null,
        gameCount: dbEntity.gameCount,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}

function parseGameRulesDetails(details: string | null): GameRulesDetails | null {
    return parseStoredGameRulesDetails(details);
}
