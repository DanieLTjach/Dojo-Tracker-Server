import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ClubInviteService } from '../service/ClubInviteService.ts';
import { AuthService } from '../service/AuthService.ts';
import { clubInvitePreviewSchema, clubInviteRedeemSchema } from '../schema/ClubSchemas.ts';

export class ClubInviteController {
    private inviteService: ClubInviteService = new ClubInviteService();
    private authService: AuthService = new AuthService();

    previewInvite(req: Request, res: Response) {
        const { params: { code } } = clubInvitePreviewSchema.parse(req);
        const { invite, isRedeemable } = this.inviteService.getInvitePreview(code);

        return res.status(StatusCodes.OK).json({
            code: invite.code,
            type: invite.type,
            clubId: invite.clubId,
            clubName: invite.clubName,
            label: invite.label,
            isRedeemable
        });
    }

    redeemInvite(req: Request, res: Response) {
        const { params: { code }, body: { name } } = clubInviteRedeemSchema.parse(req);
        const initDataParams = req.query as Record<string, string>;

        this.authService.validateInitData(initDataParams);
        const telegramUser = this.authService.extractTelegramUser(initDataParams);

        const result = this.inviteService.redeemInvite(code, telegramUser, name);
        return res.status(StatusCodes.OK).json(result);
    }
}
