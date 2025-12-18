import type { Request, Response, RequestHandler } from "express";
import { db } from "./dbInit.ts";

export function withTransaction(handler: (req: Request, res: Response) => void): RequestHandler {
    return (req: Request, res: Response) => {
        db.transaction(() => {
            handler(req, res);
        })();
    }
}