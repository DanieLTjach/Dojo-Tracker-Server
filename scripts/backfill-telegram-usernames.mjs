#!/usr/bin/env node

import Database from 'better-sqlite3';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adjectives = [
    'agile',
    'brisk',
    'calm',
    'clever',
    'cosmic',
    'daring',
    'eager',
    'eclectic',
    'gentle',
    'lucky',
    'merry',
    'nimble',
    'quiet',
    'rapid',
    'sunny',
    'vivid',
];
const nouns = [
    'badger',
    'crane',
    'dingo',
    'falcon',
    'fox',
    'gecko',
    'heron',
    'koala',
    'lynx',
    'otter',
    'panda',
    'raven',
    'tiger',
    'whale',
    'wolf',
    'yak',
];
const generatedPattern = /^@[a-z]+_[a-z]+_\d{3}$/;

export function generateUniqueUsername(existing, random = randomInt) {
    for (let attempt = 0; attempt < 10_000; attempt++) {
        const adjective = adjectives[random(adjectives.length)];
        const noun = nouns[random(nouns.length)];
        const digits = String(random(1000)).padStart(3, '0');
        const candidate = `@${adjective}_${noun}_${digits}`;
        if (!existing.has(candidate.toLowerCase())) {
            existing.add(candidate.toLowerCase());
            return candidate;
        }
    }
    throw new Error('Could not generate a unique Telegram username after 10000 attempts');
}

export function fillMissingTelegramUsernames(db, options = {}) {
    // id 0 is the SYSTEM user; migration 012 assigns it the '@system' nickname directly
    const rows = db.prepare('SELECT id FROM user WHERE telegramUsername IS NULL AND id != 0 ORDER BY id').all();
    const existing = new Set(
        db.prepare('SELECT telegramUsername FROM user WHERE telegramUsername IS NOT NULL').all()
            .map(row => row.telegramUsername.toLowerCase())
    );
    const entries = rows.map(row => ({
        id: row.id,
        generated: generateUniqueUsername(existing, options.random ?? randomInt),
    }));

    if (!options.dryRun) {
        const update = db.prepare('UPDATE user SET telegramUsername = :generated WHERE id = :id');
        db.transaction(() => entries.forEach(entry => update.run(entry)))();
        const manifestPath = options.manifestPath ?? defaultManifestPath(options.now ?? new Date());
        fs.writeFileSync(manifestPath, `${JSON.stringify(entries, null, 2)}\n`, { flag: 'wx' });
        return { entries, manifestPath };
    }
    return { entries, manifestPath: undefined };
}

export function cleanupGeneratedTelegramUsernames(db, entries, options = {}) {
    const guardedUpdate = db.prepare(`
        UPDATE user
        SET telegramUsername = NULL
        WHERE id = :id AND telegramUsername = :generated`);
    if (options.dryRun) {
        return entries.filter(entry => {
            const row = db.prepare('SELECT telegramUsername FROM user WHERE id = :id').get(entry);
            return row?.telegramUsername === entry.generated;
        });
    }
    const reverted = [];
    db.transaction(() => {
        for (const entry of entries) {
            if (guardedUpdate.run(entry).changes === 1) {
                reverted.push(entry);
            }
        }
    })();
    return reverted;
}

function defaultManifestPath(now) {
    const timestamp = now.toISOString().replaceAll(':', '-').replaceAll('.', '-');
    return path.join(path.dirname(fileURLToPath(import.meta.url)), `nickname-backfill-${timestamp}.json`);
}

function parseArgs(argv) {
    const options = { dryRun: false };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--db') {
            options.dbPath = argv[++index];
        } else if (arg === '--cleanup') {
            options.cleanupManifest = argv[++index];
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    if (!options.dbPath) {
        throw new Error('--db <path> is required');
    }
    return options;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const db = new Database(options.dbPath);
    try {
        if (options.cleanupManifest) {
            const entries = JSON.parse(fs.readFileSync(options.cleanupManifest, 'utf8'));
            const reverted = cleanupGeneratedTelegramUsernames(db, entries, options);
            console.table(reverted);
            console.log(`${options.dryRun ? 'Would revert' : 'Reverted'} ${reverted.length} usernames`);
            return;
        }
        const result = fillMissingTelegramUsernames(db, options);
        console.table(result.entries);
        console.log(`${options.dryRun ? 'Would fill' : 'Filled'} ${result.entries.length} usernames`);
        if (result.manifestPath) {
            console.log(`Manifest: ${result.manifestPath}`);
        }
    } finally {
        db.close();
    }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}

export { generatedPattern };
