import { GameRulesRepository, type InsertGameRulesParams } from '../repository/GameRulesRepository.ts';
import { CannotDeleteGameRulesInUseError, CannotUpdateGameRulesInUseError, GameRulesNotFoundError } from '../error/EventErrors.ts';
import type { GameRules, GameRulesDetails, RuleValue } from '../model/EventModels.ts';
import type { GameRulesValues } from '../data/gameRulesCatalog.ts';
import { gameRulesPresetsByKey } from '../data/gameRulesPresets.ts';
import { UserService } from './UserService.ts';
import { ClubMembershipService } from './ClubMembershipService.ts';
import { EventService } from './EventService.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';

export class GameRulesService {
    private gameRulesRepository: GameRulesRepository = new GameRulesRepository();
    private userService: UserService = new UserService();
    private clubMembershipService: ClubMembershipService = new ClubMembershipService();
    private eventService: EventService = new EventService();

    getAllGameRules(clubId?: number): GameRules[] {
        if (clubId !== undefined) {
            return this.gameRulesRepository.findAllGameRulesByClubId(clubId);
        }
        return this.gameRulesRepository.findAllGameRules();
    }

    getGameRulesById(id: number): GameRules {
        const gameRules = this.gameRulesRepository.findGameRulesById(id);
        if (!gameRules) {
            throw new GameRulesNotFoundError(id);
        }
        return gameRules;
    }

    updateGameRulesDetails(id: number, details: GameRulesDetails | null, userId: number): GameRules {
        const gameRules = this.getGameRulesById(id);
        this.validateUserCanUpdateGameRules(gameRules, userId);
        const compacted = details ? compactDetails(details) : null;
        this.gameRulesRepository.updateGameRulesDetails(id, compacted);
        return this.getGameRulesById(id);
    }

    createGameRules(params: InsertGameRulesParams, userId: number): GameRules {
        this.clubMembershipService.validateUserCanEditClub(params.clubId, userId);
        const newId = this.gameRulesRepository.insertGameRules(params);
        return this.getGameRulesById(newId);
    }

    updateGameRules(id: number, params: InsertGameRulesParams, userId: number): GameRules {
        const gameRules = this.getGameRulesById(id);
        this.validateUserCanUpdateGameRules(gameRules, userId);
        this.validateGameRulesHaveNoGames(gameRules);
        this.gameRulesRepository.updateGameRules(id, params);
        return this.getGameRulesById(id);
    }

    deleteGameRules(id: number, userId: number): void {
        const gameRules = this.getGameRulesById(id);
        this.validateUserCanUpdateGameRules(gameRules, userId);

        const eventCount = this.eventService.countEventsByGameRulesId(id);
        if (eventCount > 0) {
            throw new CannotDeleteGameRulesInUseError(gameRules.name, eventCount);
        }

        this.gameRulesRepository.deleteGameRules(id);
    }

    private validateUserCanUpdateGameRules(gameRules: GameRules, userId: number): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (gameRules.clubId === null) {
            throw new InsufficientPermissionsError();
        }

        this.clubMembershipService.validateUserCanEditClub(gameRules.clubId, userId);
    }

    private validateGameRulesHaveNoGames(gameRules: GameRules): void {
        const gameCount = this.eventService.countGamesByGameRulesId(gameRules.id);
        if (gameCount > 0) {
            throw new CannotUpdateGameRulesInUseError(gameRules.name, gameCount);
        }
    }
}

function ruleValuesEqual(a: RuleValue, b: RuleValue): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
}

function compactDetails(details: GameRulesDetails): GameRulesDetails {
    if (!details.preset) return details;

    const preset = gameRulesPresetsByKey.get(details.preset);
    if (!preset) {
        throw new Error(`Unknown game-rules preset "${details.preset}"`);
    }

    const overrides: GameRulesValues = {};
    for (const [key, value] of Object.entries(details.rules)) {
        if (value === undefined) continue;
        const presetValue = preset.rules[key as keyof GameRulesValues];
        if (presetValue === undefined || !ruleValuesEqual(value, presetValue)) {
            overrides[key as keyof GameRulesValues] = value;
        }
    }

    return { ...details, rules: overrides };
}
