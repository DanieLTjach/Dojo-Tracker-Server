import { dbManager } from '../db/dbInit.ts';
import type { DetailedGame, TrackedGamePlayerData } from '../model/GameModels.ts';
import { GameStatus, Wind } from '../model/GameModels.ts';
import { EventRegistrationService } from './EventRegistrationService.ts';
import { EventService } from './EventService.ts';
import { GameService } from './GameService.ts';
import LogService from './LogService.ts';
import { TrackedGameService } from './TrackedGameService.ts';
import { UserService } from './UserService.ts';
import { SupportedLocale, t } from '../i18n/index.ts';
import { resolveUserLocale } from '../util/LocaleResolver.ts';

export interface TournamentRoundImportResult {
    imported: number;
    errors: string[];
    games: DetailedGame[];
}

interface ParsedTable {
    tableNumber: number;
    players: TrackedGamePlayerData[];
}

const ROUND_HEADER_PATTERN = /^Round\s+(\d+)$/i;

class ImportRollbackError extends Error {}

export class TournamentRoundImportService {
    private gameService: GameService = new GameService();
    private trackedGameService: TrackedGameService = new TrackedGameService();
    private eventService: EventService = new EventService();
    private eventRegistrationService: EventRegistrationService = new EventRegistrationService();
    private userService: UserService = new UserService();

    parseAndImport(
        eventId: number,
        expectedRound: number,
        text: string,
        importedBy: number
    ): TournamentRoundImportResult {
        const errors: string[] = [];
        const user = this.userService.getUserById(importedBy);
        const locale = resolveUserLocale(user);

        const event = this.eventService.getEventById(eventId);
        if (event.type !== 'TOURNAMENT') {
            return { imported: 0, errors: [t('telegram.importParse.notTournament', {}, locale)], games: [] };
        }
        if (this.eventService.hasEventEnded(event)) {
            return {
                imported: 0,
                errors: [t('telegram.importParse.eventEnded', { eventName: event.name }, locale)],
                games: [],
            };
        }

        const playerCount = event.gameRules.numberOfPlayers as 3 | 4;

        let tables: ParsedTable[];
        try {
            tables = this.parseSeatingBlock(eventId, text, expectedRound, playerCount, errors, locale);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return { imported: 0, errors: [message], games: [] };
        }

        if (errors.length > 0) {
            return { imported: 0, errors, games: [] };
        }

        if (tables.length === 0) {
            return { imported: 0, errors: [t('telegram.importParse.noPlayerRows', {}, locale)], games: [] };
        }

        this.validateTables(eventId, expectedRound, tables, errors, locale);
        if (errors.length > 0) {
            return { imported: 0, errors, games: [] };
        }

        const games: DetailedGame[] = [];
        const baseTimestamp = new Date();

        try {
            dbManager.db.transaction(() => {
                for (let i = 0; i < tables.length; i++) {
                    const table = tables[i]!;
                    const createdAt = new Date(baseTimestamp.getTime() + i * 1000);

                    try {
                        const game = this.trackedGameService.createTrackedGame(
                            eventId,
                            table.players,
                            importedBy,
                            GameStatus.CREATED,
                            createdAt,
                            expectedRound,
                            String(table.tableNumber)
                        );
                        games.push(game);
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : String(error);
                        LogService.logError(
                            `Tournament round import failed for event ${eventId} round ${expectedRound} table ${table.tableNumber} (importedBy=${importedBy})`,
                            error
                        );
                        errors.push(
                            t('telegram.importParse.tablePrefix', { table: table.tableNumber, message }, locale)
                        );
                    }
                }
                if (errors.length > 0) {
                    throw new ImportRollbackError();
                }
            })();
        } catch (error: unknown) {
            if (!(error instanceof ImportRollbackError)) {
                throw error;
            }
            return { imported: 0, errors, games: [] };
        }

        return { imported: games.length, errors, games };
    }

    private parseSeatingBlock(
        eventId: number,
        text: string,
        expectedRound: number,
        playerCount: 3 | 4,
        errors: string[],
        locale: SupportedLocale
    ): ParsedTable[] {
        const lines = text.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);

        if (lines.length < 2) {
            throw new Error(t('telegram.importParse.expectHeaderAndRows', {}, locale));
        }

        const headerMatch = lines[0]!.match(ROUND_HEADER_PATTERN);
        if (!headerMatch) {
            throw new Error(t('telegram.importParse.firstLineFormat', {}, locale));
        }

        const roundInPaste = Number(headerMatch[1]);
        if (roundInPaste !== expectedRound) {
            throw new Error(t('telegram.importParse.roundMismatch', { roundInPaste, expectedRound }, locale));
        }

        const tables: ParsedTable[] = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i]!;
            const tableNumber = i;

            const tokens = line.split(/\s+/).filter(token => token.length > 0);
            if (tokens.length !== playerCount) {
                errors.push(
                    t('telegram.importParse.rowWrongPlayerCount', {
                        table: tableNumber,
                        playerCount,
                        actual: tokens.length,
                    }, locale)
                );
                continue;
            }

            const players: TrackedGamePlayerData[] = [];
            let rowValid = true;

            for (let p = 0; p < tokens.length; p++) {
                const token = tokens[p]!;
                const userId = Number(token);
                if (!Number.isInteger(userId) || userId <= 0) {
                    errors.push(t('telegram.importParse.rowInvalidUserId', { table: tableNumber, token }, locale));
                    rowValid = false;
                    break;
                }

                try {
                    this.userService.validateUserIsActiveById(userId);
                    this.eventRegistrationService.validateUserIsApprovedParticipant(eventId, userId);
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    errors.push(t('telegram.importParse.rowPrefix', { table: tableNumber, message }, locale));
                    rowValid = false;
                    break;
                }

                players.push({ userId, startPlace: Object.values(Wind)[p]! });
            }

            if (rowValid && players.length === playerCount) {
                tables.push({ players, tableNumber });
            }
        }

        return tables;
    }

    private validateTables(
        eventId: number,
        tournamentRound: number,
        tables: ParsedTable[],
        errors: string[],
        locale: SupportedLocale
    ): void {
        const seenUserIds = new Set<number>();

        for (const table of tables) {
            const tableKey = String(table.tableNumber);
            const existing = this.gameService.findGameByEventRoundAndTable(eventId, tournamentRound, tableKey);
            if (existing !== undefined) {
                errors.push(
                    t(
                        'telegram.importParse.tableGameExists',
                        { table: table.tableNumber, round: tournamentRound },
                        locale
                    )
                );
            }

            const tableUserIds = new Set<number>();
            for (const player of table.players) {
                if (tableUserIds.has(player.userId)) {
                    errors.push(
                        t('telegram.importParse.tablePlayerDuplicate', {
                            table: table.tableNumber,
                            userId: player.userId,
                        }, locale)
                    );
                }
                tableUserIds.add(player.userId);

                if (seenUserIds.has(player.userId)) {
                    errors.push(t('telegram.importParse.playerOnMultipleTables', { userId: player.userId }, locale));
                }
                seenUserIds.add(player.userId);
            }
        }
    }
}
