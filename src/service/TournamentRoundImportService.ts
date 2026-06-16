import { dbManager } from '../db/dbInit.ts';
import type { DetailedGame, TrackedGamePlayerData } from '../model/GameModels.ts';
import { GameStatus, Wind } from '../model/GameModels.ts';
import { EventRegistrationService } from './EventRegistrationService.ts';
import { EventService } from './EventService.ts';
import { GameService } from './GameService.ts';
import LogService from './LogService.ts';
import { TrackedGameService } from './TrackedGameService.ts';
import { UserService } from './UserService.ts';

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

        const event = this.eventService.getEventById(eventId);
        if (event.type !== 'TOURNAMENT') {
            return { imported: 0, errors: ['Подія не є турніром'], games: [] };
        }
        if (this.eventService.hasEventEnded(event)) {
            return { imported: 0, errors: [`${event.name} вже закінчився`], games: [] };
        }

        const playerCount = event.gameRules.numberOfPlayers as 3 | 4;

        let tables: ParsedTable[];
        try {
            tables = this.parseSeatingBlock(eventId, text, expectedRound, playerCount, errors);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return { imported: 0, errors: [message], games: [] };
        }

        if (errors.length > 0) {
            return { imported: 0, errors, games: [] };
        }

        if (tables.length === 0) {
            return { imported: 0, errors: ['Немає рядків з гравцями'], games: [] };
        }

        this.validateTables(eventId, expectedRound, tables, errors);
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
                        errors.push(`Стіл ${table.tableNumber}: ${message}`);
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
        errors: string[]
    ): ParsedTable[] {
        const lines = text.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);

        if (lines.length < 2) {
            throw new Error('Очікується заголовок "Round N" і хоча б один рядок з гравцями');
        }

        const headerMatch = lines[0]!.match(ROUND_HEADER_PATTERN);
        if (!headerMatch) {
            throw new Error('Перший рядок має бути у форматі "Round N" (наприклад, Round 3)');
        }

        const roundInPaste = Number(headerMatch[1]);
        if (roundInPaste !== expectedRound) {
            throw new Error(`Номер раунду в даних (${roundInPaste}) не збігається з введеним (${expectedRound})`);
        }

        const tables: ParsedTable[] = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i]!;
            const tableNumber = i;

            const tokens = line.split(/\s+/).filter(token => token.length > 0);
            if (tokens.length !== playerCount) {
                errors.push(`Рядок ${tableNumber}: очікується ${playerCount} id гравців, отримано ${tokens.length}`);
                continue;
            }

            const players: TrackedGamePlayerData[] = [];
            let rowValid = true;

            for (let p = 0; p < tokens.length; p++) {
                const token = tokens[p]!;
                const userId = Number(token);
                if (!Number.isInteger(userId) || userId <= 0) {
                    errors.push(`Рядок ${tableNumber}: "${token}" не є коректним id користувача`);
                    rowValid = false;
                    break;
                }

                try {
                    this.userService.validateUserIsActiveById(userId);
                    this.eventRegistrationService.validateUserIsApprovedParticipant(eventId, userId);
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    errors.push(`Рядок ${tableNumber}: ${message}`);
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
        errors: string[]
    ): void {
        const seenUserIds = new Set<number>();

        for (const table of tables) {
            const tableKey = String(table.tableNumber);
            const existing = this.gameService.findGameByEventRoundAndTable(eventId, tournamentRound, tableKey);
            if (existing !== undefined) {
                errors.push(`Стіл ${table.tableNumber}: гра для раунду ${tournamentRound} вже існує`);
            }

            const tableUserIds = new Set<number>();
            for (const player of table.players) {
                if (tableUserIds.has(player.userId)) {
                    errors.push(`Стіл ${table.tableNumber}: гравець ${player.userId} повторюється`);
                }
                tableUserIds.add(player.userId);

                if (seenUserIds.has(player.userId)) {
                    errors.push(`Гравець ${player.userId} зустрічається на кількох столах`);
                }
                seenUserIds.add(player.userId);
            }
        }
    }
}
