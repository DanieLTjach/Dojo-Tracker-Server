import fs from 'fs';
import { parseArgs } from 'node:util';
import { dbManager } from '../src/db/dbInit.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import { ClubMembershipRepository } from '../src/repository/ClubMembershipRepository.ts';

const { values } = parseArgs({
    options: {
        file: { type: 'string' },
        clubId: { type: 'string' },
        createdBy: { type: 'string', default: '0' },
    },
});

const filePath = values.file;
const clubId = Number(values.clubId);
const createdBy = Number(values.createdBy);

if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: node scripts/import-users.ts --file <path> --clubId <id> [--createdBy <userId>]');
    console.error('Error: --file is required and must exist');
    process.exit(1);
}

if (!clubId || isNaN(clubId)) {
    console.error('Error: --clubId is required and must be a number');
    process.exit(1);
}

// Validate club exists
const club = dbManager.db.prepare('SELECT id FROM club WHERE id = ?').get(clubId);
if (!club) {
    console.error(`Error: Club with id ${clubId} not found`);
    process.exit(1);
}

const userRepository = new UserRepository();
const clubMembershipRepository = new ClubMembershipRepository();

const csvContent = fs.readFileSync(filePath, 'utf-8');
const lines = csvContent.trim().split('\n');

if (lines.length < 2) {
    console.error('Error: CSV file must have a header row and at least one data row');
    process.exit(1);
}

const header = lines[0]!.split(',').map(h => h.trim());
const expectedHeader = ['name', 'telegramUsername', 'telegramId'];
if (header.join(',') !== expectedHeader.join(',')) {
    console.error(`Error: CSV header must be: ${expectedHeader.join(',')}`);
    console.error(`Got: ${header.join(',')}`);
    process.exit(1);
}

interface ImportRow {
    name: string;
    telegramUsername: string;
    telegramId: number;
}

const rows: ImportRow[] = [];
const parseErrors: string[] = [];

for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const parts = line.split(',').map(p => p.trim());
    const name = parts[0];
    const telegramUsername = parts[1];
    const telegramId = Number(parts[2]);

    if (!name) {
        parseErrors.push(`Row ${i + 1}: name is empty`);
        continue;
    }
    if (!telegramUsername || !telegramUsername.startsWith('@')) {
        parseErrors.push(`Row ${i + 1}: telegramUsername must start with @`);
        continue;
    }
    if (isNaN(telegramId) || telegramId <= 0) {
        parseErrors.push(`Row ${i + 1}: telegramId must be a positive number`);
        continue;
    }

    rows.push({ name, telegramUsername, telegramId });
}

if (parseErrors.length > 0) {
    console.error('CSV parsing errors:');
    parseErrors.forEach(e => console.error(`  ${e}`));
    process.exit(1);
}

let imported = 0;
let skipped = 0;
const importErrors: string[] = [];

const runImport = dbManager.db.transaction(() => {
    const now = new Date();

    for (const row of rows) {
        // Check if user already exists by telegramId
        const existingByTelegramId = userRepository.findUserByTelegramId(row.telegramId);
        if (existingByTelegramId) {
            console.log(`  SKIP: "${row.name}" — telegramId ${row.telegramId} already exists (user: ${existingByTelegramId.name})`);
            skipped++;
            continue;
        }

        // Check if user already exists by telegramUsername
        const existingByUsername = userRepository.findUserByTelegramUsername(row.telegramUsername);
        if (existingByUsername) {
            console.log(`  SKIP: "${row.name}" — ${row.telegramUsername} already exists (user: ${existingByUsername.name})`);
            skipped++;
            continue;
        }

        try {
            const userId = userRepository.registerUser(row.name, row.telegramUsername, row.telegramId, createdBy);

            clubMembershipRepository.createMembership({
                clubId,
                userId,
                role: 'MEMBER',
                status: 'ACTIVE',
                createdAt: now,
                modifiedAt: now,
                modifiedBy: createdBy,
            });

            console.log(`  OK: "${row.name}" (${row.telegramUsername}) — userId: ${userId}`);
            imported++;
        } catch (error: any) {
            importErrors.push(`"${row.name}": ${error.message}`);
        }
    }
});

console.log(`\nImporting ${rows.length} users into club ${clubId}...\n`);

try {
    runImport();
} catch (error: any) {
    console.error(`\nTransaction failed: ${error.message}`);
    process.exit(1);
}

console.log(`\n--- Import Summary ---`);
console.log(`Total rows:  ${rows.length}`);
console.log(`Imported:    ${imported}`);
console.log(`Skipped:     ${skipped}`);

if (importErrors.length > 0) {
    console.log(`Errors:      ${importErrors.length}`);
    importErrors.forEach(e => console.error(`  ${e}`));
}

dbManager.closeDB();
