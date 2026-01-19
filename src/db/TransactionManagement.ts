import type { Request, Response, RequestHandler } from "express";
import { dbManager } from "./dbInit.ts";

export function withTransaction(handler: (req: Request, res: Response) => void): RequestHandler {
    return (req: Request, res: Response) => {
        dbManager.db.transaction(() => {
            handler(req, res);
        })();
    }
}