import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { Event } from '../model/EventModels.ts';

export class EventRepository {
    private findAllEventsStatement(): Statement<[], EventWithGameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                e.*,
                gr.id as gr_id,
                gr.name as gr_name,
                gr.numberOfPlayers as gr_numberOfPlayers,
                gr.uma as gr_uma,
                gr.startingPoints as gr_startingPoints,
                gr.startingRating as gr_startingRating,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            ORDER BY e.createdAt DESC`
        );
    }

    findAllEvents(): Event[] {
        return this.findAllEventsStatement().all().map(eventWithGameRulesFromDBEntity);
    }

    private findEventByIdStatement(): Statement<{ id: number }, EventWithGameRulesDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                e.*,
                gr.id as gr_id,
                gr.name as gr_name,
                gr.numberOfPlayers as gr_numberOfPlayers,
                gr.uma as gr_uma,
                gr.startingPoints as gr_startingPoints,
                gr.startingRating as gr_startingRating,
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

    private createEventStatement(): Statement<EventCreateParams, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO event (name, description, type, gameRules, dateFrom, dateTo, createdAt, modifiedAt, modifiedBy)
            VALUES (:name, :description, :type, :gameRules, :dateFrom, :dateTo, :createdAt, :modifiedAt, :modifiedBy)
            RETURNING id
        `);
    }

    createEvent(params: EventCreateParams): number {
        const result = this.createEventStatement().get(params);
        return result!.id;
    }

    private updateEventStatement(): Statement<EventUpdateParams, void> {
        return dbManager.db.prepare(`
            UPDATE event
            SET name = COALESCE(:name, name),
                description = COALESCE(:description, description),
                type = COALESCE(:type, type),
                gameRules = COALESCE(:gameRules, gameRules),
                dateFrom = COALESCE(:dateFrom, dateFrom),
                dateTo = COALESCE(:dateTo, dateTo),
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE id = :id
        `);
    }

    updateEvent(params: EventUpdateParams): void {
        this.updateEventStatement().run(params);
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

interface EventCreateParams {
    name: string;
    description: string | null;
    type: string;
    gameRules: number;
    dateFrom: string | null;
    dateTo: string | null;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

interface EventUpdateParams {
    id: number;
    name?: string | undefined;
    description?: string | undefined;
    type?: string | undefined;
    gameRules?: number | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    modifiedAt: string;
    modifiedBy: number;
}

interface EventWithGameRulesDBEntity {
    id: number;
    name: string;
    description: string | null;
    type: string;
    gameRules: number;
    dateFrom: string | null;
    dateTo: string | null;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
    gr_id: number;
    gr_name: string;
    gr_numberOfPlayers: number;
    gr_uma: string;
    gr_startingPoints: number;
    gr_startingRating: number;
    gameCount: number;
}

function eventWithGameRulesFromDBEntity(dbEntity: EventWithGameRulesDBEntity): Event {
    return {
        id: dbEntity.id,
        name: dbEntity.name,
        description: dbEntity.description,
        type: dbEntity.type,
        gameRules: {
            id: dbEntity.gr_id,
            name: dbEntity.gr_name,
            numberOfPlayers: dbEntity.gr_numberOfPlayers,
            uma: parseUma(dbEntity.gr_uma),
            startingPoints: dbEntity.gr_startingPoints,
            startingRating: dbEntity.gr_startingRating
        },
        dateFrom: dbEntity.dateFrom !== null ? new Date(dbEntity.dateFrom) : null,
        dateTo: dbEntity.dateTo !== null ? new Date(dbEntity.dateTo) : null,
        gameCount: dbEntity.gameCount,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}

function parseUma(umaString: string): number[] | number[][] {
    const parsedUma = umaString.split(';').map(part => part.split(',').map(Number));
    if (parsedUma.length === 1) {
        return parsedUma[0]!;
    } else {
        return parsedUma;
    }
}
