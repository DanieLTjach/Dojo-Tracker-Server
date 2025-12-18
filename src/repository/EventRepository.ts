import type { Statement } from "better-sqlite3";
import { db } from "../db/dbInit.ts";

export class EventRepository {
    
    private findEventByIdStatement: Statement<{ id: number }, unknown> =
        db.prepare('SELECT * FROM event WHERE id = :id');

    findEventById(eventId: number): unknown | undefined {
        return this.findEventByIdStatement.get({ id: eventId });
    }
}