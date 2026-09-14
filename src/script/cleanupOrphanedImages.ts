/**
 * Deletes Storage objects that no row in the database references any more.
 *
 * Clients cannot delete from the bucket (see storage.rules - there is no
 * `delete` rule on purpose, so a client can never orphan an image a live post
 * still points at). That makes cleanup a backend job, and this is it.
 *
 * Objects become orphaned in two ways: a composer upload the user abandoned
 * before posting, and an image whose owning row was deleted or replaced (for
 * example changing your avatar leaves the previous one behind).
 *
 * Usage:
 *   npm run storage:cleanup:dev                 # dry run - lists, deletes nothing
 *   npm run storage:cleanup:dev -- --delete     # actually delete
 *   npm run storage:cleanup:dev -- --delete --min-age-hours 1
 *
 * Defaults are deliberately cautious: a dry run, and objects younger than 24h
 * are always kept so an upload that is mid-composer is never pulled out from
 * under the user.
 */
import 'dotenv/config';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';
import { dbManager } from '../db/dbInit.ts';
import { extractObjectPath } from '../util/StorageUrlUtil.ts';

const DEFAULT_MIN_AGE_HOURS = 24;

function getFlag(name: string): boolean {
    return process.argv.includes(name);
}

function getFlagValue(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    if (index === -1 || index === process.argv.length - 1) {
        return undefined;
    }
    return process.argv[index + 1];
}

function parseMinAgeHours(): number {
    const raw = getFlagValue('--min-age-hours');
    if (raw === undefined) {
        return DEFAULT_MIN_AGE_HOURS;
    }
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours < 0) {
        throw new Error(`--min-age-hours expects a non-negative number, got: ${raw}`);
    }
    return hours;
}

function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `${name} is required. Point it at a service account JSON from ` +
                'Firebase console -> Project settings -> Service accounts.'
        );
    }
    return value;
}

function collectReferencedPaths(): Set<string> {
    const referenced = new Set<string>();

    // Every column that can hold a Storage URL. Keep this list in step with the
    // schema - a column missed here reads as "unreferenced" and its objects
    // would be deleted while still in use.
    const sources: { table: string, column: string }[] = [
        { table: 'profile', column: 'avatarUrl' },
        { table: 'club', column: 'logoUrl' },
        { table: 'post_image', column: 'url' },
        { table: 'clubAchievementDefinition', column: 'icon' },
    ];

    for (const { table, column } of sources) {
        const rows = dbManager.db
            .prepare(`SELECT ${column} AS url FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`)
            .all() as { url: string }[];
        for (const row of rows) {
            const path = extractObjectPath(row.url);
            if (path) {
                referenced.add(path);
            }
        }
    }

    return referenced;
}

async function main(): Promise<void> {
    const shouldDelete = getFlag('--delete');
    const minAgeHours = parseMinAgeHours();
    const prefix = getFlagValue('--prefix') ?? process.env['FIREBASE_STORAGE_ENV'] ?? 'development';

    const credentialsPath = getRequiredEnv('GOOGLE_APPLICATION_CREDENTIALS');
    const bucketName = getRequiredEnv('FIREBASE_STORAGE_BUCKET');

    const serviceAccount = JSON.parse(readFileSync(credentialsPath, 'utf8')) as ServiceAccount;
    initializeApp({ credential: cert(serviceAccount), storageBucket: bucketName });

    const referenced = collectReferencedPaths();
    console.log(`Referenced by the database: ${referenced.size} object(s)`);

    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: `${prefix}/` });
    console.log(`Found in bucket under "${prefix}/": ${files.length} object(s)`);

    const cutoff = Date.now() - minAgeHours * 60 * 60 * 1000;
    const orphans = [];
    let keptTooYoung = 0;

    for (const file of files) {
        if (referenced.has(file.name)) {
            continue;
        }
        // An abandoned-looking object may just be an upload still in progress,
        // so never touch anything newer than the age floor.
        const created = new Date(file.metadata.timeCreated ?? 0).getTime();
        if (created > cutoff) {
            keptTooYoung += 1;
            continue;
        }
        orphans.push(file);
    }

    const totalBytes = orphans.reduce((sum, file) => sum + Number(file.metadata.size ?? 0), 0);
    console.log(`Kept (younger than ${minAgeHours}h): ${keptTooYoung}`);
    console.log(`Orphaned: ${orphans.length} object(s), ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

    for (const file of orphans) {
        console.log(`  ${shouldDelete ? 'deleting' : 'would delete'} ${file.name}`);
    }

    if (!shouldDelete) {
        console.log('\nDry run - nothing was deleted. Re-run with --delete to remove them.');
        return;
    }

    let deleted = 0;
    for (const file of orphans) {
        try {
            await file.delete();
            deleted += 1;
        } catch (error) {
            console.error(`  failed to delete ${file.name}:`, error);
        }
    }
    console.log(`\nDeleted ${deleted} of ${orphans.length} object(s).`);
}

main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
        // A missing/!invalid setting is a configuration problem, not a crash -
        // print what to fix rather than a stack trace the user cannot act on.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\nCleanup failed: ${message}`);
        process.exit(1);
    });
