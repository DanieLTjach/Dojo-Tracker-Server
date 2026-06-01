import request from 'supertest';
import express from 'express';
import inviteRoutes from '../src/routes/InviteRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createTelegramInitData } from './testHelpers.ts';
import { ClubInviteService } from '../src/service/ClubInviteService.ts';
import { ClubMembershipRepository } from '../src/repository/ClubMembershipRepository.ts';
import { ClubRepository } from '../src/repository/ClubRepository.ts';
import type { ClubInviteType } from '../src/model/ClubModels.ts';

const SYSTEM_USER_ID = 0;
const TELEGRAM_BASE = 9500000;

const app = express();
app.use(express.json());
app.use('/api/invites', inviteRoutes);
app.use(handleErrors);

function initDataQuery(telegramId: number, username?: string): string {
    return new URLSearchParams(createTelegramInitData(telegramId, username)).toString();
}

describe('Invite API Endpoints', () => {
    const inviteService = new ClubInviteService();
    const membershipRepository = new ClubMembershipRepository();
    const clubRepository = new ClubRepository();
    let clubId: number;

    function cleanup(): void {
        dbManager.db.prepare('DELETE FROM clubInviteRedemption WHERE inviteId IN (SELECT id FROM clubInvite WHERE clubId = ?)').run(clubId);
        dbManager.db.prepare('DELETE FROM clubInvite WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM user WHERE telegramId >= ? AND telegramId < ?').run(TELEGRAM_BASE, TELEGRAM_BASE + 100000);
    }

    function createInvite(type: ClubInviteType) {
        return inviteService.createInvite({ clubId, type, source: 'FESTIVAL', createdBy: SYSTEM_USER_ID });
    }

    beforeAll(() => {
        clubId = clubRepository.createClub({
            name: 'Invite API Club',
            address: null,
            city: null,
            description: null,
            contactInfo: null,
            isActive: true,
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
            modifiedBy: SYSTEM_USER_ID
        });
    });

    afterEach(() => cleanup());

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('previews an invite', async () => {
        const invite = createInvite('JOIN_CLUB');
        const response = await request(app).get(`/api/invites/${invite.code}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            code: invite.code,
            type: 'JOIN_CLUB',
            clubId,
            clubName: 'Invite API Club',
            isRedeemable: true
        });
    });

    it('returns 404 previewing an unknown code', async () => {
        const response = await request(app).get('/api/invites/UNKNOWN000');
        expect(response.status).toBe(404);
    });

    it('redeems a JOIN_CLUB invite and creates an ACTIVE membership', async () => {
        const invite = createInvite('JOIN_CLUB');
        const response = await request(app)
            .post(`/api/invites/${invite.code}/redeem?${initDataQuery(TELEGRAM_BASE + 1, 'festival_guest')}`)
            .send({ name: 'Festival Guest' });

        expect(response.status).toBe(200);
        expect(response.body.nextAction).toBe('CLUB_HOME');

        const membership = membershipRepository.findMembership(clubId, response.body.user.id);
        expect(membership?.status).toBe('ACTIVE');
    });

    it('redeems a REGISTRATION_ONLY invite without creating a membership', async () => {
        const invite = createInvite('REGISTRATION_ONLY');
        const response = await request(app)
            .post(`/api/invites/${invite.code}/redeem?${initDataQuery(TELEGRAM_BASE + 2, 'newcomer')}`)
            .send({ name: 'Newcomer' });

        expect(response.status).toBe(200);
        expect(response.body.nextAction).toBe('TUTORIAL');
        expect(membershipRepository.findMembership(clubId, response.body.user.id)).toBeUndefined();
    });

    it('rejects redeeming a revoked invite', async () => {
        const invite = createInvite('JOIN_CLUB');
        inviteService.revokeInvite(invite.id, SYSTEM_USER_ID);

        const response = await request(app)
            .post(`/api/invites/${invite.code}/redeem?${initDataQuery(TELEGRAM_BASE + 3, 'late')}`)
            .send({ name: 'Late Guest' });

        expect(response.status).toBe(400);
    });
});
