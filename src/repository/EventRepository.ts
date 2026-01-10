import type { Statement } from 'better-sqlite3';
import { db } from '../db/dbInit.ts';
import type { Event, GameRules } from '../model/EventModels.ts';
import { dateFromSqliteString } from '../db/dbUtils.ts';

export class EventRepository {
    private findEventByIdStatement: Statement<{ id: number }, EventDBEntity> = db.prepare(
        'SELECT * FROM event WHERE id = :id'
    );

    findEventById(eventId: number): Event | undefined {
        const eventDBEntity = this.findEventByIdStatement.get({ id: eventId });
        return eventDBEntity !== undefined ? eventFromDBEntity(eventDBEntity) : undefined;
    }

    private findGameRulesByEventIdStatement: Statement<{ eventId: number }, GameRulesDBEntity> = db.prepare(
        `SELECT gr.* 
             FROM gameRules gr
             JOIN event e ON e.gameRules = gr.id
             WHERE e.id = :eventId`
    );

    findGameRulesByEventId(eventId: number): GameRules | undefined {
        const gameRulesDBEntity = this.findGameRulesByEventIdStatement.get({ eventId });
        return gameRulesDBEntity !== undefined ? gameRulesFromDBEntity(gameRulesDBEntity) : undefined;
    }
}

interface GameRulesDBEntity {
    id: number;
    name: string;
    numberOfPlayers: number;
    uma: string;
    startingPoints: number;
    startingRating: number;
}

function gameRulesFromDBEntity(dbEntity: GameRulesDBEntity): GameRules {
    return { ...dbEntity, uma: dbEntity.uma.split(',').map(Number) };
}

interface EventDBEntity {
    id: number;
    name: string | null;
    type: string;
    gameRules: number;
    dateFrom: string | null;
    dateTo: string | null;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

function eventFromDBEntity(dbEntity: EventDBEntity): Event {
    return {
        ...dbEntity,
        dateFrom: dbEntity.dateFrom !== null ? dateFromSqliteString(dbEntity.dateFrom) : null,
        dateTo: dbEntity.dateTo !== null ? dateFromSqliteString(dbEntity.dateTo) : null,
        createdAt: dateFromSqliteString(dbEntity.createdAt),
        modifiedAt: dateFromSqliteString(dbEntity.modifiedAt),
    };
}
