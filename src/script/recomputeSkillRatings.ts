/**
 * One-shot skill rating recompute, for running after a deploy.
 *
 * Migration 015 creates the skill tables empty — it does no backfill, because the
 * placement logic that decides finishing order lives in TypeScript, not SQL. Until
 * something populates them the leaderboards render "No data to display", so this
 * needs to run once after the migration lands.
 *
 *   npm run skill:recompute              all clubs, both game sizes
 *   npm run skill:recompute -- --club 1  one club, both game sizes
 *
 * Equivalent to POST /api/admin/skill/recompute, minus the admin token. Prefer this
 * on a server where minting a JWT by hand is the awkward part.
 *
 * Deliberately imports dbInit and the service rather than src/index.ts: importing the
 * app would start the Telegram bot, the poll scheduler and an HTTP listener, none of
 * which a one-shot wants.
 */
import 'dotenv/config';
import { dbManager } from '../db/dbInit.ts';
import LogService from '../service/LogService.ts';
import { SkillRatingService } from '../service/SkillRatingService.ts';
import type { SkillRecomputeResult } from '../model/SkillModels.ts';

function parseClubId(argv: string[]): number | null {
    const flagIndex = argv.indexOf('--club');
    if (flagIndex === -1) {
        return null;
    }

    const raw = argv[flagIndex + 1];
    const clubId = Number(raw);
    if (!Number.isInteger(clubId) || clubId <= 0) {
        throw new Error(`--club expects a positive integer club id, got: ${raw ?? '(missing)'}`);
    }

    return clubId;
}

function main(): void {
    const clubId = parseClubId(process.argv.slice(2));
    const skillRatingService = new SkillRatingService();

    const scope = clubId === null ? 'all clubs' : `club ${clubId}`;
    console.log(`Recomputing skill ratings for ${scope}...`);

    // A single transaction, matching how the routes call recompute: a partial rebuild
    // would leave tracks holding ratings replayed from an incomplete game set.
    const results = dbManager.db.transaction((): SkillRecomputeResult[] =>
        clubId === null
            ? skillRatingService.recomputeAll()
            : skillRatingService.recomputeClub(clubId)
    )();

    if (results.length === 0) {
        console.log('No clubs with finished games — nothing to recompute.');
        return;
    }

    let totalGames = 0;
    let totalMs = 0;
    for (const r of results) {
        totalGames += r.gamesProcessed;
        totalMs += r.durationMs;
        console.log(
            `  club ${r.clubId} ${r.gameSize}p: ${r.gamesProcessed} games, ` +
                `${r.playersAffected} players, ${r.durationMs}ms`
        );
    }

    console.log(`Done: ${results.length} tracks, ${totalGames} games, ${totalMs}ms.`);
}

try {
    main();
} catch (error) {
    console.error('Skill rating recompute failed:', error);
    process.exitCode = 1;
} finally {
    dbManager.closeDB();
    // LogService polls its queue on a timer that never settles, so without this the
    // process hangs after the work is done. shutdown() also flushes pending messages.
    await LogService.shutdown();
}
