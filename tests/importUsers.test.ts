import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import gameRoutes from '../src/routes/GameRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createTestEvent } from './testHelpers.ts';

const SYSTEM_USER_ID = 0;
const CLUB_ID = 1;
const TEST_EVENT_ID = 1000;
const CSV_PATH = path.resolve('./tests/fixtures/test-import-users.csv');

const testUsers = [
    { name: 'ImportTest User1', telegramUsername: '@importtest_user1', telegramId: 900000001 },
    { name: 'ImportTest User2', telegramUsername: '@importtest_user2', telegramId: 900000002 },
    { name: 'ImportTest User3', telegramUsername: '@importtest_user3', telegramId: 900000003 },
    { name: 'ImportTest User4', telegramUsername: '@importtest_user4', telegramId: 900000004 },
];

function writeCsv(users: typeof testUsers) {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    const header = 'name,telegramUsername,telegramId';
    const rows = users.map(u => `${u.name},${u.telegramUsername},${u.telegramId}`);
    fs.writeFileSync(CSV_PATH, [header, ...rows].join('\n'));
}

function runImportScript(filePath: string, clubId: number, createdBy: number = 0): string {
    return execSync(
        `node scripts/import-users.ts --file ${filePath} --clubId ${clubId} --createdBy ${createdBy}`,
        { cwd: path.resolve('.'), env: { ...process.env }, encoding: 'utf-8' }
    );
}

describe('Import Users CLI Script', () => {

    beforeAll(() => {
        createTestEvent();
    });

    afterAll(() => {
        if (fs.existsSync(CSV_PATH)) fs.unlinkSync(CSV_PATH);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    test('imports users into DB with correct fields', () => {
        writeCsv(testUsers);
        const output = runImportScript(CSV_PATH, CLUB_ID);

        expect(output).toContain('Imported:    4');
        expect(output).toContain('Skipped:     0');

        for (const u of testUsers) {
            const row = dbManager.db.prepare('SELECT * FROM user WHERE telegramId = ?').get(u.telegramId) as any;
            expect(row).toBeDefined();
            expect(row.name).toBe(u.name);
            expect(row.telegramUsername).toBe(u.telegramUsername);
            expect(row.isActive).toBe(1);
            expect(row.status).toBe('ACTIVE');
        }
    });

    test('creates club memberships for imported users', () => {
        for (const u of testUsers) {
            const user = dbManager.db.prepare('SELECT id FROM user WHERE telegramId = ?').get(u.telegramId) as any;
            const membership = dbManager.db.prepare(
                'SELECT * FROM clubMembership WHERE clubId = ? AND userId = ?'
            ).get(CLUB_ID, user.id) as any;

            expect(membership).toBeDefined();
            expect(membership.role).toBe('MEMBER');
            expect(membership.status).toBe('ACTIVE');
        }
    });

    test('skips already existing users on re-run', () => {
        writeCsv(testUsers);
        const output = runImportScript(CSV_PATH, CLUB_ID);

        expect(output).toContain('Imported:    0');
        expect(output).toContain('Skipped:     4');
    });

    test('imported users can be used to create a game', async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/games', gameRoutes);
        app.use(handleErrors);

        const userIds = testUsers.map(u => {
            const row = dbManager.db.prepare('SELECT id FROM user WHERE telegramId = ?').get(u.telegramId) as any;
            return row.id as number;
        });

        const adminAuth = createAuthHeader(SYSTEM_USER_ID);

        const response = await request(app)
            .post('/api/games')
            .set('Authorization', adminAuth)
            .send({
                eventId: TEST_EVENT_ID,
                playersData: [
                    { userId: userIds[0], points: 40000, startPlace: 'EAST' },
                    { userId: userIds[1], points: 35000, startPlace: 'SOUTH' },
                    { userId: userIds[2], points: 25000, startPlace: 'WEST' },
                    { userId: userIds[3], points: 20000, startPlace: 'NORTH' },
                ]
            });

        expect(response.status).toBe(201);
        expect(response.body.players).toHaveLength(4);
    });
});
