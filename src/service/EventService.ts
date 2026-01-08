import { EventNotFoundError, GameRulesNotFoundError } from "../error/EventErrors.ts";
import type { GameRules } from "../model/EventModels.ts";
import { EventRepository } from "../repository/EventRepository.ts";

export class EventService {

    private eventRepository: EventRepository = new EventRepository();

    validateEventExists(eventId: number): void {
        const event = this.eventRepository.findEventById(eventId);
        if (!event) {
            throw new EventNotFoundError(eventId);
        }
    }

    getGameRulesByEventId(eventId: number): GameRules {
        const gameRules = this.eventRepository.findGameRulesByEventId(eventId);
        if (!gameRules) {
            throw new GameRulesNotFoundError(eventId);
        }
        return gameRules;
    }
}