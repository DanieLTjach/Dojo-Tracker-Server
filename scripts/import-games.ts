// CLI wrapper for ImportService.importGames — bulk-import games from a CSV file into an event.
//
// Usage:
//   npx tsx scripts/import-games.ts --file <csv> --eventId <id> [--importedBy <userId>] [--dry-run]
//
// CSV format (see ImportService for full spec):
//   player{1..N}_username, player{1..N}_points, player{1..N}_startPlace, player{1..N}_chombo,
//   [createdAt], [tournamentRound], [tournamentTable]
//
// Users are matched by their telegramUsername (including the leading '@') by default. Pass
// --match-by name to match on the user's display name instead — needed for historical imports
// whose players have no telegramUsername on record.

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { dbManager } from '../src/db/dbInit.ts';
import { ImportService, IMPORT_MATCH_BY_VALUES, type ImportMatchBy } from '../src/service/ImportService.ts';
import LogService from '../src/service/LogService.ts';

const { values } = parseArgs({
    options: {
        file: { type: 'string' },
        eventId: { type: 'string' },
        importedBy: { type: 'string', default: '0' },
        'match-by': { type: 'string', default: 'username' },
        'dry-run': { type: 'boolean', default: false },
    },
});

const filePath = values.file;
const eventId = Number(values.eventId);
const importedBy = Number(values.importedBy);
const matchBy = values['match-by'] as ImportMatchBy;
const dryRun = values['dry-run'] ?? false;

const USAGE = 'Usage: npx tsx scripts/import-games.ts --file <csv> --eventId <id> ' +
    `[--importedBy <userId>] [--match-by ${IMPORT_MATCH_BY_VALUES.join('|')}] [--dry-run]`;

if (!filePath || !fs.existsSync(filePath)) {
    console.error(USAGE);
    console.error('Error: --file is required and must exist');
    process.exit(1);
}
if (!eventId || isNaN(eventId)) {
    console.error('Error: --eventId is required and must be a number');
    process.exit(1);
}
if (!IMPORT_MATCH_BY_VALUES.includes(matchBy)) {
    console.error(USAGE);
    console.error(`Error: --match-by must be one of: ${IMPORT_MATCH_BY_VALUES.join(', ')}`);
    process.exit(1);
}

const event = dbManager.db.prepare('SELECT id, name FROM event WHERE id = ?').get(eventId) as {
    id: number;
    name: string;
} | undefined;
if (!event) {
    console.error(`Error: Event with id ${eventId} not found`);
    process.exit(1);
}

const csvContent = fs.readFileSync(filePath, 'utf-8');
const importService = new ImportService();

console.log(
    `Importing into event #${event.id} "${event.name}" (matching users by ${matchBy})${dryRun ? ' (DRY RUN)' : ''}...`
);

const result = dryRun
    ? importService.validateGames(eventId, csvContent, matchBy)
    : importService.importGames(eventId, csvContent, importedBy, matchBy);

if (dryRun) {
    console.log(`Validated CSV (no games written).`);
} else {
    console.log(`Imported: ${result.imported} games`);
}

// Drain the LogService queue so admin-channel logs (per-game posts) reach Telegram before exit,
// then close the DB and exit explicitly — otherwise the LogService poll loop keeps the process alive.
await LogService.shutdown();
dbManager.closeDB();

if (result.errors.length > 0) {
    console.error(`${result.errors.length} error(s):`);
    for (const err of result.errors) {
        console.error(`  Row ${err.row}: ${err.message}`);
    }
    process.exit(1);
}

process.exit(0);
