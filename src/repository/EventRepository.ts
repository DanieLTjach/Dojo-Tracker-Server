import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { Event, EventType } from '../model/EventModels.ts';
import { parseUma } from '../util/UmaUtil.ts';
import { parseEventType, parseTournamentStatus, parseUmaTieBreak } from '../util/EnumUtil.ts';
import { parseGameRulesDetailsAndApplyPresets } from '../util/GameRulesDetailsUtil.ts';
import type { EventConfig, EventInfo } from '../model/EventModels.ts';
import { resolvePlayerNameDisplay } from '../model/EventModels.ts';
import { booleanToInteger } from '../db/dbUtils.ts';
import type { TournamentStatus } from '../model/TournamentModels.ts';

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
                t.status as tournament_status,
                t.currentRound as tournament_currentRound,
                t.totalRounds as tournament_totalRounds,
                t.createdAt as tournament_createdAt,
                t.modifiedAt as tournament_modifiedAt,
                t.modifiedBy as tournament_modifiedBy,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            LEFT JOIN club c ON e.clubId = c.id
            LEFT JOIN tournament t ON t.eventId = e.id
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
                t.status as tournament_status,
                t.currentRound as tournament_currentRound,
                t.totalRounds as tournament_totalRounds,
                t.createdAt as tournament_createdAt,
                t.modifiedAt as tournament_modifiedAt,
                t.modifiedBy as tournament_modifiedBy,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            LEFT JOIN club c ON e.clubId = c.id
            LEFT JOIN tournament t ON t.eventId = e.id
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
                t.status as tournament_status,
                t.currentRound as tournament_currentRound,
                t.totalRounds as tournament_totalRounds,
                t.createdAt as tournament_createdAt,
                t.modifiedAt as tournament_modifiedAt,
                t.modifiedBy as tournament_modifiedBy,
                (SELECT COUNT(*) FROM game WHERE game.eventId = e.id) as gameCount
            FROM event e
            JOIN gameRules gr ON e.gameRules = gr.id
            LEFT JOIN club c ON e.clubId = c.id
            LEFT JOIN tournament t ON t.eventId = e.id
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
        maxParticipants: number | null;
        registrationDeadline: string | null;
        startingRating: number;
        minimumGamesForRating: number;
        info: string | null;
        config: string | null;
        blockGameCreation: number;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO event (name, description, type, gameRules, clubId, dateFrom, dateTo, maxParticipants, registrationDeadline, startingRating, minimumGamesForRating, info, config, blockGameCreation, createdAt, modifiedAt, modifiedBy)
            VALUES (:name, :description, :type, :gameRules, :clubId, :dateFrom, :dateTo, :maxParticipants, :registrationDeadline, :startingRating, :minimumGamesForRating, :info, :config, :blockGameCreation, :createdAt, :modifiedAt, :modifiedBy)
            RETURNING id
        `);
    }

    createEvent(params: EventCreateParams): number {
        const result = this.createEventStatement().get({
            ...params,
            dateFrom: params.dateFrom?.toISOString() ?? null,
            dateTo: params.dateTo?.toISOString() ?? null,
            registrationDeadline: params.registrationDeadline?.toISOString() ?? null,
            info: params.info !== null ? JSON.stringify(params.info) : null,
            config: params.config !== null ? JSON.stringify(params.config) : null,
            blockGameCreation: booleanToInteger(params.blockGameCreation),
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
        maxParticipants: number | null;
        registrationDeadline: string | null;
        startingRating: number;
        minimumGamesForRating: number;
        info: string | null;
        config: string | null;
        blockGameCreation: number;
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
                maxParticipants = :maxParticipants,
                registrationDeadline = :registrationDeadline,
                startingRating = :startingRating,
                minimumGamesForRating = :minimumGamesForRating,
                info = :info,
                config = :config,
                blockGameCreation = :blockGameCreation,
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
            registrationDeadline: params.registrationDeadline?.toISOString() ?? null,
            info: params.info !== null ? JSON.stringify(params.info) : null,
            config: params.config !== null ? JSON.stringify(params.config) : null,
            blockGameCreation: booleanToInteger(params.blockGameCreation),
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

    private countGamesByGameRulesIdStatement(): Statement<{ gameRulesId: number }, { count: number }> {
        return dbManager.db.prepare(`
            SELECT COUNT(*) as count
            FROM game g
            JOIN event e ON g.eventId = e.id
            WHERE e.gameRules = :gameRulesId
        `);
    }

    countGamesByGameRulesId(gameRulesId: number): number {
        return this.countGamesByGameRulesIdStatement().get({ gameRulesId })!.count;
    }
}

export interface EventCreateParams {
    name: string;
    description: string | null;
    type: EventType;
    gameRules: number;
    clubId: number | null;
    dateFrom: Date | null;
    dateTo: Date | null;
    maxParticipants: number | null;
    registrationDeadline: Date | null;
    startingRating: number;
    minimumGamesForRating: number;
    info: EventInfo | null;
    config: EventConfig | null;
    blockGameCreation: boolean;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface EventUpdateParams {
    id: number;
    name: string;
    description: string | null;
    type: EventType;
    gameRules: number;
    clubId: number | null;
    dateFrom: Date | null;
    dateTo: Date | null;
    maxParticipants: number | null;
    registrationDeadline: Date | null;
    startingRating: number;
    minimumGamesForRating: number;
    info: EventInfo | null;
    config: EventConfig | null;
    blockGameCreation: boolean;
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
    maxParticipants: number | null;
    registrationDeadline: string | null;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
    info: string | null;
    config: string | null;
    blockGameCreation: number;
    gr_id: number;
    gr_name: string;
    gr_clubId: number | null;
    gr_numberOfPlayers: number;
    gr_uma: string;
    gr_startingPoints: number;
    gr_chomboPointsAfterUma: number | null;
    gr_umaTieBreak: string;
    gr_details: string | null;
    tournament_status: TournamentStatus | null;
    tournament_currentRound: number | null;
    tournament_totalRounds: number | null;
    tournament_createdAt: string | null;
    tournament_modifiedAt: string | null;
    tournament_modifiedBy: number | null;
    gameCount: number;
}

function eventWithGameRulesFromDBEntity(dbEntity: EventWithGameRulesDBEntity): Event {
    const config = dbEntity.config !== null ? JSON.parse(dbEntity.config) as EventConfig : null;
    const eventType = parseEventType(dbEntity.type);
    return {
        id: dbEntity.id,
        name: dbEntity.name,
        description: dbEntity.description,
        type: eventType,
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
            details: parseGameRulesDetailsAndApplyPresets(dbEntity.gr_details)
        },
        dateFrom: dbEntity.dateFrom !== null ? new Date(dbEntity.dateFrom) : null,
        dateTo: dbEntity.dateTo !== null ? new Date(dbEntity.dateTo) : null,
        maxParticipants: dbEntity.maxParticipants,
        registrationDeadline: dbEntity.registrationDeadline !== null ? new Date(dbEntity.registrationDeadline) : null,
        info: dbEntity.info !== null ? JSON.parse(dbEntity.info) as EventInfo : null,
        config,
        resolvedPlayerNameDisplay: resolvePlayerNameDisplay(config, eventType),
        blockGameCreation: Boolean(dbEntity.blockGameCreation),
        tournament: dbEntity.tournament_status !== null
            ? {
                eventId: dbEntity.id,
                status: parseTournamentStatus(dbEntity.tournament_status),
                currentRound: dbEntity.tournament_currentRound,
                totalRounds: dbEntity.tournament_totalRounds!,
                createdAt: new Date(dbEntity.tournament_createdAt!),
                modifiedAt: new Date(dbEntity.tournament_modifiedAt!),
                modifiedBy: dbEntity.tournament_modifiedBy!
            }
            : null,
        gameCount: dbEntity.gameCount,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}
