/** Post-migration backfill. Usage: `npm run skill:recompute -- [--club ID]`. */
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

    // Avoid committing a partial rebuild.
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
    // Stops LogService's queue timer and flushes pending messages.
    await LogService.shutdown();
}
