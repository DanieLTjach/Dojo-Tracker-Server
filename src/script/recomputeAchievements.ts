/** Full historical backfill. Usage: `npm run achievements:recompute -- [--user-id ID | --club-id ID]`. */
import 'dotenv/config';
import { dbManager } from '../db/dbInit.ts';
import LogService from '../service/LogService.ts';
import { AutomaticAchievementService } from '../service/AutomaticAchievementService.ts';

function parseArg(argv: string[], flag: string): number | null {
    const flagIndex = argv.indexOf(flag);
    if (flagIndex === -1) return null;

    const raw = argv[flagIndex + 1];
    const val = Number(raw);
    if (!Number.isInteger(val) || val <= 0) {
        throw new Error(`${flag} expects a positive integer, got: ${raw ?? '(missing)'}`);
    }
    return val;
}

function main(): void {
    const args = process.argv.slice(2);
    const userId = parseArg(args, '--user-id');
    const clubId = parseArg(args, '--club-id');

    const service = new AutomaticAchievementService();
    const startTime = Date.now();

    if (userId !== null) {
        console.log(`Recomputing automatic achievements for user ${userId}...`);
        service.recomputeUser(userId);
    } else if (clubId !== null) {
        console.log(`Recomputing automatic achievements for club ${clubId}...`);
        service.recomputeClub(clubId);
    } else {
        console.log('Recomputing automatic achievements for ALL users and clubs...');
        service.recomputeAll();
    }

    console.log(`Done in ${Date.now() - startTime}ms.`);
}

try {
    main();
} catch (error) {
    console.error('Achievement recompute failed:', error);
    process.exitCode = 1;
} finally {
    dbManager.closeDB();
    await LogService.shutdown();
}
