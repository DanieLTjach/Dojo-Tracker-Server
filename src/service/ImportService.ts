import { GameService } from './GameService.ts';
import { EventService } from './EventService.ts';
import { UserRepository } from '../repository/UserRepository.ts';
import { CsvParsingError, NoValidGamesInCsvError } from '../error/ImportErrors.ts';
import type { PlayerData } from '../model/GameModels.ts';
import type { GameWithPlayers } from '../model/GameModels.ts';

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
    tournamentHanchanNumber: number | null;
    tournamentTableNumber: number | null;
}

const PLAYER_COLUMNS = ['username', 'points', 'startPlace', 'chombo'] as const;
const VALID_START_PLACES = ['EAST', 'SOUTH', 'WEST', 'NORTH'] as const;

export class ImportService {

    private gameService: GameService = new GameService();
    private eventService: EventService = new EventService();
    private userRepository: UserRepository = new UserRepository();

    importGames(eventId: number, csvContent: string, importedBy: number): ImportResult {
        const event = this.eventService.getEventById(eventId);
        const numberOfPlayers = event.gameRules.numberOfPlayers;

        const { headers, dataRows } = this.parseCsv(csvContent);
        this.validateHeaders(headers, numberOfPlayers);

        // Pass 1: Validate all rows
        const parsedRows: (ParsedGameRow | null)[] = [];
        const errors: RowError[] = [];

        for (let i = 0; i < dataRows.length; i++) {
            const rowNumber = i + 2; // 1-indexed, skip header
            const cells = dataRows[i]!;

            try {
                const parsed = this.parseGameRow(cells, headers, numberOfPlayers, rowNumber);
                parsedRows.push(parsed);
            } catch (error: any) {
                errors.push({ row: rowNumber, message: error.message });
                parsedRows.push(null);
            }
        }

        if (errors.length > 0) {
            return { imported: 0, errors, games: [] };
        }

        if (parsedRows.length === 0) {
            throw new NoValidGamesInCsvError();
        }

        // Pass 2: Insert all games
        const games: GameWithPlayers[] = [];
        const baseTimestamp = new Date();

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
                    parsed.tournamentHanchanNumber,
                    parsed.tournamentTableNumber
                );
                games.push(game);
            } catch (error: any) {
                errors.push({ row: i + 2, message: error.message });
            }
        }

        return {
            imported: games.length,
            errors,
            games
        };
    }

    private parseCsv(csvContent: string): { headers: string[]; dataRows: string[][] } {
        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) {
            throw new CsvParsingError('CSV file must have a header row and at least one data row');
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
                    throw new CsvParsingError(`Missing required column: ${expected}`);
                }
            }
        }
    }

    private parseGameRow(cells: string[], headers: string[], numberOfPlayers: number, rowNumber: number): ParsedGameRow {
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
                throw new Error(`Row ${rowNumber}: player${p}_username is empty`);
            }

            const user = this.userRepository.findUserByTelegramUsername(username);
            if (!user) {
                throw new Error(`Row ${rowNumber}: user ${username} not found`);
            }

            const points = Number(pointsStr);
            if (isNaN(points) || !Number.isInteger(points)) {
                throw new Error(`Row ${rowNumber}: player${p}_points must be an integer`);
            }

            let startPlace: 'EAST' | 'SOUTH' | 'WEST' | 'NORTH' | undefined = undefined;
            if (startPlaceStr) {
                if (!VALID_START_PLACES.includes(startPlaceStr as any)) {
                    throw new Error(`Row ${rowNumber}: player${p}_startPlace must be one of: ${VALID_START_PLACES.join(', ')}`);
                }
                startPlace = startPlaceStr as typeof VALID_START_PLACES[number];
            }

            const chomboCount = chomboStr ? Number(chomboStr) : 0;
            if (isNaN(chomboCount) || !Number.isInteger(chomboCount) || chomboCount < 0) {
                throw new Error(`Row ${rowNumber}: player${p}_chombo must be a non-negative integer`);
            }

            players.push({
                userId: user.id,
                points,
                startPlace: startPlace ?? null,
                chomboCount
            });
        }

        let createdAt: Date | undefined = undefined;
        const createdAtStr = getValue('createdAt');
        if (createdAtStr) {
            createdAt = new Date(createdAtStr);
            if (isNaN(createdAt.getTime())) {
                throw new Error(`Row ${rowNumber}: createdAt is not a valid date`);
            }
        }

        const hanchanStr = getValue('tournamentHanchanNumber');
        const tableStr = getValue('tournamentTableNumber');

        const tournamentHanchanNumber = hanchanStr ? Number(hanchanStr) : null;
        const tournamentTableNumber = tableStr ? Number(tableStr) : null;

        if (tournamentHanchanNumber !== null && (isNaN(tournamentHanchanNumber) || tournamentHanchanNumber < 1)) {
            throw new Error(`Row ${rowNumber}: tournamentHanchanNumber must be a positive integer`);
        }
        if (tournamentTableNumber !== null && (isNaN(tournamentTableNumber) || tournamentTableNumber < 1)) {
            throw new Error(`Row ${rowNumber}: tournamentTableNumber must be a positive integer`);
        }

        return { players, createdAt, tournamentHanchanNumber, tournamentTableNumber };
    }
}
