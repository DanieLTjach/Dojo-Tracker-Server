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
