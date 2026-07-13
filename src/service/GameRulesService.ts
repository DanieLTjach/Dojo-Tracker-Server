import { isDeepStrictEqual } from 'node:util';
import { GameRulesRepository, type InsertGameRulesParams } from '../repository/GameRulesRepository.ts';
import {
    CannotDeleteGameRulesInUseError,
    CannotUpdateGameRulesInUseError,
    GameRulesNotFoundError,
} from '../error/EventErrors.ts';
import type { GameRules, GameRulesDetails, RuleValue } from '../model/EventModels.ts';
import type { GameRulesValues } from '../data/gameRulesCatalog.ts';
import { gameRulesPresetsByKey } from '../data/gameRulesPresets.ts';
import { UserService } from './UserService.ts';
import { ClubMembershipService } from './ClubMembershipService.ts';
import { EventService } from './EventService.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';
import { parseGameRulesDetailsForCore } from '../schema/GameRulesSchemas.ts';

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

    updateGameRulesDetails(id: number, details: GameRulesDetails, userId: number): GameRules {
        const gameRules = this.getGameRulesById(id);
        this.validateUserCanUpdateGameRules(gameRules, userId);
        this.writeGameRulesDetails(id, details, gameRules);
        return this.getGameRulesById(id);
    }

    createGameRules(params: CreateGameRulesServiceParams, userId: number): GameRules {
        const { details, ...gameRulesParams } = params;
        if (gameRulesParams.clubId === null) {
            this.userService.validateUserIsAdmin(userId, () => new InsufficientPermissionsError());
        } else {
            this.clubMembershipService.validateUserCanEditClub(gameRulesParams.clubId, userId);
        }

        const validatedDetails = details === undefined
            ? undefined
            : parseGameRulesDetailsForCore(details, gameRulesParams);
        const newId = this.gameRulesRepository.insertGameRules(gameRulesParams);
        if (validatedDetails !== undefined) {
            this.writeGameRulesDetails(newId, validatedDetails, gameRulesParams);
        }
        return this.getGameRulesById(newId);
    }

    updateGameRules(id: number, params: UpdateGameRulesServiceParams, userId: number): GameRules {
        const gameRules = this.getGameRulesById(id);
        this.validateUserCanUpdateGameRules(gameRules, userId);
        const { details, ...gameRulesParams } = params;
        const validatedDetails = details === undefined
            ? undefined
            : parseGameRulesDetailsForCore(details, gameRulesParams);

        if (!gameRulesCoreFieldsEqual(gameRules, gameRulesParams)) {
            this.validateGameRulesHaveNoGames(gameRules);
            this.gameRulesRepository.updateGameRules(id, gameRulesParams);
        }

        if (validatedDetails !== undefined) {
            this.writeGameRulesDetails(id, validatedDetails, gameRulesParams);
        }

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

    private writeGameRulesDetails(
        id: number,
        details: GameRulesDetails,
        core: Pick<GameRules, 'numberOfPlayers' | 'startingPoints'>
    ): void {
        const validated = parseGameRulesDetailsForCore(details, core);
        this.gameRulesRepository.updateGameRulesDetails(id, compactDetails(validated));
    }
}

export interface UpdateGameRulesServiceParams extends InsertGameRulesParams {
    details?: GameRulesDetails | undefined;
}

export interface CreateGameRulesServiceParams extends InsertGameRulesParams {
    details?: GameRulesDetails | undefined;
}

const GAME_RULES_CORE_FIELDS = [
    'name',
    'clubId',
    'numberOfPlayers',
    'startingPoints',
    'umaTieBreak',
    'uma',
] as const satisfies readonly (keyof InsertGameRulesParams)[];

function gameRulesCoreFieldsEqual(gameRules: GameRules, params: InsertGameRulesParams): boolean {
    return GAME_RULES_CORE_FIELDS.every(key => isDeepStrictEqual(gameRules[key], params[key]));
}

function ruleValuesEqual(a: RuleValue, b: RuleValue): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
}

function compactDetails(details: GameRulesDetails): GameRulesDetails {
    const rulesWithoutCoreFields = Object.fromEntries(
        Object.entries(details.rules).filter(([key]) => key !== 'number_of_players' && key !== 'starting_points')
    ) as GameRulesValues;
    const detailsWithoutCoreFields = { ...details, rules: rulesWithoutCoreFields };

    if (!details.preset) return detailsWithoutCoreFields;

    const preset = gameRulesPresetsByKey.get(details.preset);
    if (!preset) {
        throw new Error(`Unknown game-rules preset "${details.preset}"`);
    }

    const overrides: GameRulesValues = {};
    for (const [key, value] of Object.entries(rulesWithoutCoreFields)) {
        if (value === undefined) continue;
        const presetValue = preset.rules[key as keyof GameRulesValues];
        if (presetValue === undefined || !ruleValuesEqual(value, presetValue)) {
            (overrides as Record<string, RuleValue>)[key] = value;
        }
    }

    return { ...detailsWithoutCoreFields, rules: overrides };
}
