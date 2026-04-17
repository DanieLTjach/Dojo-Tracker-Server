import { GameRulesRepository, type InsertGameRulesParams } from '../repository/GameRulesRepository.ts';
import { EventRepository } from '../repository/EventRepository.ts';
import { CannotDeleteGameRulesInUseError, CannotUpdateGameRulesInUseError, GameRulesNotFoundError } from '../error/EventErrors.ts';
import type { GameRules, GameRulesDetails, RuleValue } from '../model/EventModels.ts';
import { gameRulesPresetsByKey } from '../data/gameRulesPresets.ts';
import { UserService } from './UserService.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { ClubRole } from '../model/ClubModels.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';
import { InsufficientClubPermissionsError } from '../error/ClubErrors.ts';

export class GameRulesService {
    private gameRulesRepository: GameRulesRepository;
    private eventRepository: EventRepository;
    private userService: UserService;
    private clubMembershipRepository: ClubMembershipRepository;

    constructor() {
        this.gameRulesRepository = new GameRulesRepository();
        this.eventRepository = new EventRepository();
        this.userService = new UserService();
        this.clubMembershipRepository = new ClubMembershipRepository();
    }

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
        this.ensureCanUpdateGameRules(gameRules, userId);
        const compacted = details ? compactDetails(details) : null;
        this.gameRulesRepository.updateGameRulesDetails(id, compacted);
        return this.getGameRulesById(id);
    }

    getGlobalGameRules(): GameRules[] {
        return this.gameRulesRepository.findAllGlobalGameRules();
    }

    getGameRulesWithDetailsByClubId(clubId: number): GameRules[] {
        return this.gameRulesRepository.findAllGameRulesWithDetailsByClubId(clubId);
    }

    getGameRulesWithoutDetailsByClubId(clubId: number): GameRules[] {
        return this.gameRulesRepository.findAllGameRulesWithoutDetailsByClubId(clubId);
    }

    createGameRules(params: InsertGameRulesParams, userId: number): GameRules {
        this.ensureCanCreateForClub(params.clubId, userId);
        const newId = this.gameRulesRepository.insertGameRules(params);
        return this.getGameRulesById(newId);
    }

    updateGameRules(id: number, params: InsertGameRulesParams, userId: number): GameRules {
        const gameRules = this.getGameRulesById(id);
        this.ensureCanUpdateGameRules(gameRules, userId);
        this.ensureCanChangeGameRules(gameRules);
        this.gameRulesRepository.updateGameRules(id, params);
        return this.getGameRulesById(id);
    }

    deleteGameRules(id: number, userId: number): void {
        const gameRules = this.getGameRulesById(id);
        this.ensureCanUpdateGameRules(gameRules, userId);

        const eventCount = this.eventRepository.countEventsByGameRulesId(id);
        if (eventCount > 0) {
            throw new CannotDeleteGameRulesInUseError(gameRules.name, eventCount);
        }

        this.gameRulesRepository.deleteGameRules(id);
    }

    private ensureCanCreateForClub(clubId: number, userId: number): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) return;

        const role = this.clubMembershipRepository.getUserClubRole(clubId, userId);
        if (role !== ClubRole.OWNER) {
            throw new InsufficientClubPermissionsError(ClubRole.OWNER);
        }
    }

    private ensureCanUpdateGameRules(gameRules: GameRules, userId: number): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (gameRules.clubId === null) {
            throw new InsufficientPermissionsError();
        }

        const role = this.clubMembershipRepository.getUserClubRole(gameRules.clubId, userId);
        if (role !== ClubRole.OWNER) {
            throw new InsufficientClubPermissionsError(ClubRole.OWNER);
        }
    }

    private ensureCanChangeGameRules(gameRules: GameRules): void {
        const eventCount = this.eventRepository.countEventsByGameRulesId(gameRules.id);
        if (eventCount > 0) {
            throw new CannotUpdateGameRulesInUseError(gameRules.name, eventCount);
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
    if (!preset) return details;

    const overrides: Record<string, RuleValue> = {};
    // Diff against the fully resolved preset chain so inherited defaults compact correctly.
    for (const [key, value] of Object.entries(details.rules)) {
        const presetValue = preset.rules[key];
        if (presetValue === undefined || !ruleValuesEqual(value, presetValue)) {
            overrides[key] = value;
        }
    }

    return { ...details, rules: overrides };
}
