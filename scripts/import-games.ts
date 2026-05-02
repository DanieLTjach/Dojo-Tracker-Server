// CLI wrapper for ImportService.importGames — bulk-import games from a CSV file into an event.
//
// Usage:
//   npx tsx scripts/import-games.ts --file <csv> --eventId <id> [--importedBy <userId>] [--dry-run]
//
// CSV format (see ImportService for full spec):
//   player{1..N}_username, player{1..N}_points, player{1..N}_startPlace, player{1..N}_chombo,
//   [createdAt], [tournamentHanchanNumber], [tournamentTableNumber]
//
// Users are matched by their telegramUsername (including the leading '@').

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { dbManager } from '../src/db/dbInit.ts';
import { ImportService } from '../src/service/ImportService.ts';
import LogService from '../src/service/LogService.ts';

const { values } = parseArgs({
    options: {
        file: { type: 'string' },
        eventId: { type: 'string' },
        importedBy: { type: 'string', default: '0' },
        'dry-run': { type: 'boolean', default: false },
    },
});

const filePath = values.file;
const eventId = Number(values.eventId);
const importedBy = Number(values.importedBy);
const dryRun = values['dry-run'] ?? false;

if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: npx tsx scripts/import-games.ts --file <csv> --eventId <id> [--importedBy <userId>] [--dry-run]');
    console.error('Error: --file is required and must exist');
    process.exit(1);
}
if (!eventId || isNaN(eventId)) {
    console.error('Error: --eventId is required and must be a number');
    process.exit(1);
}

const event = dbManager.db.prepare('SELECT id, name FROM event WHERE id = ?').get(eventId) as { id: number; name: string } | undefined;
if (!event) {
    console.error(`Error: Event with id ${eventId} not found`);
    process.exit(1);
}

const csvContent = fs.readFileSync(filePath, 'utf-8');
const importService = new ImportService();

console.log(`Importing into event #${event.id} "${event.name}"${dryRun ? ' (DRY RUN)' : ''}...`);

const result = dryRun
    ? importService.validateGames(eventId, csvContent)
    : importService.importGames(eventId, csvContent, importedBy);

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
