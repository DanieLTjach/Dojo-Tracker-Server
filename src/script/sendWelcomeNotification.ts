/** Broadcast welcome / system notification to all active users.
 * Usage: `npm run welcome:send -- [--dry-run] [--key KEY] [--url URL]`
 */
import 'dotenv/config';
import { dbManager } from '../db/dbInit.ts';
import LogService from '../service/LogService.ts';
import { NotificationRepository } from '../repository/NotificationRepository.ts';

function parseStringArg(argv: string[], flag: string): string | null {
    const flagIndex = argv.indexOf(flag);
    if (flagIndex === -1) return null;
    return argv[flagIndex + 1] ?? null;
}

function hasFlag(argv: string[], flag: string): boolean {
    return argv.includes(flag);
}

function main(): void {
    const args = process.argv.slice(2);
    const dryRun = hasFlag(args, '--dry-run');
    const key = parseStringArg(args, '--key') ?? 'welcome_2026_09';
    const url = parseStringArg(args, '--url') ?? '/info';

    const repo = new NotificationRepository();
    const startTime = Date.now();

    console.log(`Broadcasting system notification [key="${key}", url="${url}", dryRun=${dryRun}]...`);
    const result = repo.broadcastSystemNotification(key, url, { dryRun });

    if (dryRun) {
        console.log(`[DRY RUN] Would send to ${result.recipientCount} active user(s).`);
    } else {
        console.log(`Successfully sent to ${result.insertedCount} active user(s) (${result.recipientCount} eligible).`);
    }
    console.log(`Done in ${Date.now() - startTime}ms.`);
}

try {
    main();
} catch (error) {
    console.error('Welcome notification broadcast failed:', error);
    process.exitCode = 1;
} finally {
    dbManager.closeDB();
    await LogService.shutdown();
}
