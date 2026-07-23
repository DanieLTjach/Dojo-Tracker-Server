import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    cleanupGeneratedTelegramUsernames,
    fillMissingTelegramUsernames,
    generatedPattern,
} from '../scripts/backfill-telegram-usernames.mjs';

describe('backfill Telegram usernames script', () => {
    it('fills unique readable placeholders, writes a manifest, and cleans up guarded rows', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY, telegramUsername TEXT UNIQUE)');
        db.prepare('INSERT INTO user (id, telegramUsername) VALUES (0, NULL), (1, NULL), (2, NULL), (3, ?)')
            .run('@real_user');
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nickname-backfill-'));
        const manifestPath = path.join(directory, 'manifest.json');
        let randomValue = 0;
        const random = (maximum: number) => randomValue++ % maximum;

        const result = fillMissingTelegramUsernames(db, { manifestPath, random });

        // the SYSTEM user (id 0) is skipped; migration 012 names it directly
        expect(result.entries.map((entry: { id: number }) => entry.id)).toEqual([1, 2]);
        expect(db.prepare('SELECT telegramUsername FROM user WHERE id = 0').get())
            .toEqual({ telegramUsername: null });
        expect(result.entries.every((entry: { generated: string }) => generatedPattern.test(entry.generated)))
            .toBe(true);
        expect(new Set(result.entries.map((entry: { generated: string }) => entry.generated.toLowerCase())).size)
            .toBe(2);
        expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).toEqual(result.entries);

        const preserved = result.entries[0]!;
        db.prepare('UPDATE user SET telegramUsername = ? WHERE id = ?').run('@changed_by_user', preserved.id);
        const reverted = cleanupGeneratedTelegramUsernames(db, result.entries);

        expect(reverted).toHaveLength(1);
        expect(db.prepare('SELECT telegramUsername FROM user WHERE id = ?').get(preserved.id))
            .toEqual({ telegramUsername: '@changed_by_user' });
        expect(db.prepare('SELECT telegramUsername FROM user WHERE id = 3').get())
            .toEqual({ telegramUsername: '@real_user' });
        db.close();
    });

    it('does not mutate the database or write a manifest in dry-run mode', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY, telegramUsername TEXT UNIQUE)');
        db.prepare('INSERT INTO user (id, telegramUsername) VALUES (1, NULL)').run();
        const result = fillMissingTelegramUsernames(db, { dryRun: true, random: () => 0 });

        expect(result.entries).toHaveLength(1);
        expect(result.manifestPath).toBeUndefined();
        expect(db.prepare('SELECT telegramUsername FROM user WHERE id = 1').get())
            .toEqual({ telegramUsername: null });
        db.close();
    });
});
