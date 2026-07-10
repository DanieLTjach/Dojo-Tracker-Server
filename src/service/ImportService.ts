import { GameService } from './GameService.ts';
import { EventService } from './EventService.ts';
import { UserRepository } from '../repository/UserRepository.ts';
import {
    CsvMissingHeaderOrDataRowError,
    CsvMissingRequiredColumnError,
    NoValidGamesInCsvError,
} from '../error/ImportErrors.ts';
import { dbManager } from '../db/dbInit.ts';
import { DEFAULT_LOCALE, t } from '../i18n/index.ts';
import type { GameWithPlayers, PlayerData, Wind } from '../model/GameModels.ts';
import type { Event } from '../model/EventModels.ts';

interface RowError {
    row: number;
    message: string;
}

interface ImportResult {
    imported: number;
    errors: RowError[];
    games: GameWithPlayers[];
}

interface ParsedGameRow {
    players: PlayerData[];
    createdAt: Date | undefined;
    tournamentRound: number | null;
    tournamentTable: string | null;
}

const PLAYER_COLUMNS = ['username', 'points', 'startPlace', 'chombo'] as const;
const VALID_WINDS = ['EAST', 'SOUTH', 'WEST', 'NORTH'] as const satisfies readonly Wind[];

// Sentinel error: thrown inside the import transaction to force a rollback after collecting all per-row errors.
class ImportRollbackError extends Error {}

export class ImportService {
    private gameService: GameService = new GameService();
    private eventService: EventService = new EventService();
    private userRepository: UserRepository = new UserRepository();

    /**
     * Parse and validate the CSV without writing any games. Returns the same shape as importGames
     * with imported=0 and games=[]. Catches both row-parse errors and per-game rule errors
     * (point sums, duplicate players, etc.) so callers can surface every problem in one pass.
     */
    validateGames(eventId: number, csvContent: string): ImportResult {
        const { event, parsedRows, errors } = this.parseAndValidate(eventId, csvContent);

        if (errors.length === 0) {
            for (let i = 0; i < parsedRows.length; i++) {
                const parsed = parsedRows[i]!;
                try {
                    this.gameService.validatePlayers(parsed.players, event.gameRules);
                } catch (error: any) {
                    errors.push({ row: i + 2, message: error.message });
                }
            }
        }

        return { imported: 0, errors, games: [] };
    }

    importGames(eventId: number, csvContent: string, importedBy: number): ImportResult {
        const { parsedRows, errors } = this.parseAndValidate(eventId, csvContent);

        if (errors.length > 0) {
            return { imported: 0, errors, games: [] };
        }

        // Pass 2: insert all games inside a transaction; any per-row failure rolls back the whole batch
        const games: GameWithPlayers[] = [];
        const baseTimestamp = new Date();

        try {
            dbManager.db.transaction(() => {
                for (let i = 0; i < parsedRows.length; i++) {
                    const parsed = parsedRows[i]!;
                    const createdAt = parsed.createdAt ?? new Date(baseTimestamp.getTime() + i * 1000);

                    try {
                        const game = this.gameService.addGame(
                            eventId,
                            parsed.players,
                            importedBy,
                            createdAt,
                            true, // hideNewGameMessage
                            parsed.tournamentRound,
                            parsed.tournamentTable
                        );
                        games.push(game);
                    } catch (error: any) {
                        errors.push({ row: i + 2, message: error.message });
                    }
                }
                if (errors.length > 0) {
                    throw new ImportRollbackError();
                }
            })();
        } catch (error: unknown) {
            if (!(error instanceof ImportRollbackError)) throw error;
            return { imported: 0, errors, games: [] };
        }

        return {
            imported: games.length,
            errors,
            games,
        };
    }

    private parseAndValidate(
        eventId: number,
        csvContent: string
    ): { event: Event, parsedRows: ParsedGameRow[], errors: RowError[] } {
        const event = this.eventService.getEventById(eventId);
        const numberOfPlayers = event.gameRules.numberOfPlayers;

        const { headers, dataRows } = this.parseCsv(csvContent);
        this.validateHeaders(headers, numberOfPlayers);

        const parsedRows: ParsedGameRow[] = [];
        const errors: RowError[] = [];

        for (let i = 0; i < dataRows.length; i++) {
            const rowNumber = i + 2; // 1-indexed, skip header
            const cells = dataRows[i]!;

            try {
                const parsed = this.parseGameRow(cells, headers, numberOfPlayers, rowNumber);
                parsedRows.push(parsed);
            } catch (error: any) {
                errors.push({ row: rowNumber, message: error.message });
            }
        }

        if (errors.length === 0 && parsedRows.length === 0) {
            throw new NoValidGamesInCsvError();
        }

        return { event, parsedRows, errors };
    }

    private parseCsv(csvContent: string): { headers: string[], dataRows: string[][] } {
        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) {
            throw new CsvMissingHeaderOrDataRowError();
        }

        const headers = lines[0]!.split(',').map(h => h.trim());
        const dataRows = lines.slice(1)
            .filter(line => line.trim().length > 0)
            .map(line => line.split(',').map(cell => cell.trim()));

        return { headers, dataRows };
    }

    private validateHeaders(headers: string[], numberOfPlayers: number): void {
        for (let p = 1; p <= numberOfPlayers; p++) {
            for (const col of PLAYER_COLUMNS) {
                const expected = `player${p}_${col}`;
                if (!headers.includes(expected)) {
                    throw new CsvMissingRequiredColumnError(expected);
                }
            }
        }
    }

    private parseGameRow(
        cells: string[],
        headers: string[],
        numberOfPlayers: number,
        rowNumber: number
    ): ParsedGameRow {
        const getValue = (colName: string): string => {
            const index = headers.indexOf(colName);
            return index >= 0 && index < cells.length ? cells[index]! : '';
        };

        const players: PlayerData[] = [];

        for (let p = 1; p <= numberOfPlayers; p++) {
            const username = getValue(`player${p}_username`);
            const pointsStr = getValue(`player${p}_points`);
            const startPlaceStr = getValue(`player${p}_startPlace`);
            const chomboStr = getValue(`player${p}_chombo`);

            if (!username) {
                throw new Error(t('import.rowUsernameEmpty', DEFAULT_LOCALE, { row: rowNumber, player: p }));
            }

            const user = this.userRepository.findUserByTelegramUsername(username);
            if (!user) {
                throw new Error(t('import.rowUserNotFound', DEFAULT_LOCALE, { row: rowNumber, username }));
            }

            const points = Number(pointsStr);
            if (isNaN(points) || !Number.isInteger(points)) {
                throw new Error(t('import.rowPointsNotInteger', DEFAULT_LOCALE, { row: rowNumber, player: p }));
            }

            let startPlace: Wind | undefined = undefined;
            if (startPlaceStr) {
                if (!VALID_WINDS.includes(startPlaceStr as Wind)) {
                    throw new Error(
                        t('import.rowInvalidStartPlace', DEFAULT_LOCALE, {
                            row: rowNumber,
                            player: p,
                            validWinds: VALID_WINDS.join(', '),
                        })
                    );
                }
                startPlace = startPlaceStr as Wind;
            }

            const chomboCount = chomboStr ? Number(chomboStr) : 0;
            if (isNaN(chomboCount) || !Number.isInteger(chomboCount) || chomboCount < 0) {
                throw new Error(
                    t('import.rowChomboNotNonNegativeInteger', DEFAULT_LOCALE, { row: rowNumber, player: p })
                );
            }

            players.push({
                userId: user.id,
                points,
                startPlace: startPlace ?? null,
                chomboCount,
            });
        }

        let createdAt: Date | undefined = undefined;
        const createdAtStr = getValue('createdAt');
        if (createdAtStr) {
            createdAt = new Date(createdAtStr);
            if (isNaN(createdAt.getTime())) {
                throw new Error(t('import.rowInvalidCreatedAt', DEFAULT_LOCALE, { row: rowNumber }));
            }
        }

        const roundStr = getValue('tournamentRound');
        const tableStr = getValue('tournamentTable');

        const tournamentRound = roundStr ? Number(roundStr) : null;
        const tournamentTable = tableStr || null;

        if (tournamentRound !== null && (isNaN(tournamentRound) || tournamentRound < 1)) {
            throw new Error(t('import.rowTournamentRoundNotPositiveInteger', DEFAULT_LOCALE, { row: rowNumber }));
        }

        return { players, createdAt, tournamentRound, tournamentTable };
    }
}
