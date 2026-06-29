import type { Request, RequestHandler, Response } from 'express';
import { dbManager } from '../db/dbInit.ts';
import type { UsageAction, UsageChargeResult } from '../model/UsageModels.ts';
import { UsageService, type UsageChargeRequest } from '../service/UsageService.ts';

export type UsageChargeResolver = (req: Request) => UsageChargeRequest | undefined;

export function withUsageTransaction(
    resolveCharge: UsageChargeResolver,
    handler: (req: Request, res: Response) => void
): RequestHandler {
    const usageService = new UsageService();
    return async (req, res, next) => {
        let reservation;
        try {
            reservation = await usageService.reserveCharge(resolveCharge(req));
            if (reservation !== undefined) {
                res.locals['usageCredits'] = reservation.result;
                patchUsageJsonResponse(res, reservation.result);
                setUsageHeaders(res, reservation.result);
            }

            dbManager.db.transaction(() => {
                handler(req, res);
            })();

            await usageService.finalizeReservation(reservation);
        } catch (error) {
            await usageService.refundReservation(reservation);
            next(error);
        }
    };
}

export function setUsageHeaders(res: Response, usageCredits: UsageChargeResult): void {
    res.setHeader('X-Usage-Credits-Balance', String(usageCredits.creditsBalance));
    res.setHeader('X-Usage-Credits-Cutoff', String(usageCredits.overdraftCutoff));
    res.setHeader('X-Usage-Credits-Charged', String(usageCredits.chargedCredits));
    res.setHeader('X-Usage-Credits-Warning', usageCredits.warning ? 'true' : 'false');
}

export function createCharge(
    clubId: number | null | undefined,
    action: UsageAction,
    modifiedBy: number,
    count?: number
): UsageChargeRequest | undefined {
    if (clubId === null || clubId === undefined) {
        return undefined;
    }
    return { clubId, action, modifiedBy, count };
}

function patchUsageJsonResponse(res: Response, usageCredits: UsageChargeResult): void {
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
        if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
            return originalJson({ ...body, usageCredits });
        }
        return originalJson(body);
    };
}
