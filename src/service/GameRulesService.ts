import { GameRulesRepository, type InsertGameRulesParams } from '../repository/GameRulesRepository.ts';
import { GameRulesNotFoundError } from '../error/EventErrors.ts';
import type { GameRules, GameRulesDetails } from '../model/EventModels.ts';
import { UserService } from './UserService.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { ClubRole } from '../model/ClubModels.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';
import { InsufficientClubPermissionsError } from '../error/ClubErrors.ts';

export class GameRulesService {
    private gameRulesRepository: GameRulesRepository;
    private userService: UserService;
    private clubMembershipRepository: ClubMembershipRepository;

    constructor() {
        this.gameRulesRepository = new GameRulesRepository();
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
        this.gameRulesRepository.updateGameRulesDetails(id, details);
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
}
