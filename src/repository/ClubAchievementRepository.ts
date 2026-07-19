import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { ClubAchievementDefinition, ClubUserAchievement } from '../model/AchievementModels.ts';

interface ClubAchievementDefinitionDBEntity {
    id: number;
    clubId: number;
    name: string;
    description: string;
    icon: string | null;
    archivedAt: string | null;
    archivedBy: number | null;
    createdAt: string;
    createdBy: number;
    modifiedAt: string;
    modifiedBy: number;
}

function definitionFromDBEntity(dbEntity: ClubAchievementDefinitionDBEntity): ClubAchievementDefinition {
    return {
        id: dbEntity.id,
        clubId: dbEntity.clubId,
        name: dbEntity.name,
        description: dbEntity.description,
        icon: dbEntity.icon,
        archivedAt: dbEntity.archivedAt !== null ? new Date(dbEntity.archivedAt) : null,
        archivedBy: dbEntity.archivedBy,
        createdAt: new Date(dbEntity.createdAt),
        createdBy: dbEntity.createdBy,
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy,
    };
}

interface ClubUserAchievementDBEntity {
    id: number;
    clubId: number;
    userId: number;
    builtInCode: string | null;
    definitionId: number | null;
    note: string | null;
    awardedAt: string;
    awardedBy: number;
    revokedAt: string | null;
    revokedBy: number | null;
}

function assignmentFromDBEntity(dbEntity: ClubUserAchievementDBEntity): ClubUserAchievement {
    return {
        id: dbEntity.id,
        clubId: dbEntity.clubId,
        userId: dbEntity.userId,
        builtInCode: dbEntity.builtInCode,
        definitionId: dbEntity.definitionId,
        note: dbEntity.note,
        awardedAt: new Date(dbEntity.awardedAt),
        awardedBy: dbEntity.awardedBy,
        revokedAt: dbEntity.revokedAt !== null ? new Date(dbEntity.revokedAt) : null,
        revokedBy: dbEntity.revokedBy,
    };
}

export interface CreateDefinitionParams {
    clubId: number;
    name: string;
    description: string;
    icon: string | null;
    createdBy: number;
    createdAt: Date;
}

export interface CreateAssignmentParams {
    clubId: number;
    userId: number;
    builtInCode: string | null;
    definitionId: number | null;
    note: string | null;
    awardedBy: number;
    awardedAt: Date;
}

export class ClubAchievementRepository {
    private definitionSelect = `
        SELECT id, clubId, name, description, icon, archivedAt, archivedBy, createdAt, createdBy, modifiedAt, modifiedBy
        FROM clubAchievementDefinition
    `;

    private assignmentSelect = `
        SELECT id, clubId, userId, builtInCode, definitionId, note, awardedAt, awardedBy, revokedAt, revokedBy
        FROM clubUserAchievement
    `;

    private createDefinitionStatement(): Statement<{
        clubId: number;
        name: string;
        description: string;
        icon: string | null;
        createdAt: string;
        createdBy: number;
        modifiedAt: string;
        modifiedBy: number;
    }, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO clubAchievementDefinition (clubId, name, description, icon, createdAt, createdBy, modifiedAt, modifiedBy)
            VALUES (:clubId, :name, :description, :icon, :createdAt, :createdBy, :modifiedAt, :modifiedBy)
            RETURNING id
        `);
    }

    createDefinition(params: CreateDefinitionParams): ClubAchievementDefinition {
        const createdAt = params.createdAt.toISOString();
        const result = this.createDefinitionStatement().get({
            clubId: params.clubId,
            name: params.name,
            description: params.description,
            icon: params.icon,
            createdAt,
            createdBy: params.createdBy,
            modifiedAt: createdAt,
            modifiedBy: params.createdBy,
        });
        return this.findDefinitionById(result!.id)!;
    }

    private findDefinitionByIdStatement(): Statement<{ id: number }, ClubAchievementDefinitionDBEntity> {
        return dbManager.db.prepare(`${this.definitionSelect} WHERE id = :id`);
    }

    findDefinitionById(id: number): ClubAchievementDefinition | undefined {
        const dbEntity = this.findDefinitionByIdStatement().get({ id });
        return dbEntity !== undefined ? definitionFromDBEntity(dbEntity) : undefined;
    }

    private findDefinitionsByClubIdStatement(): Statement<{ clubId: number }, ClubAchievementDefinitionDBEntity> {
        return dbManager.db.prepare(`${this.definitionSelect} WHERE clubId = :clubId ORDER BY name COLLATE NOCASE`);
    }

    findDefinitionsByClubId(clubId: number): ClubAchievementDefinition[] {
        return this.findDefinitionsByClubIdStatement().all({ clubId }).map(definitionFromDBEntity);
    }

    private findActiveDefinitionByNameStatement(): Statement<
        { clubId: number, name: string },
        ClubAchievementDefinitionDBEntity
    > {
        return dbManager.db.prepare(
            `${this.definitionSelect} WHERE clubId = :clubId AND name = :name COLLATE NOCASE AND archivedAt IS NULL`
        );
    }

    findActiveDefinitionByName(clubId: number, name: string): ClubAchievementDefinition | undefined {
        const dbEntity = this.findActiveDefinitionByNameStatement().get({ clubId, name });
        return dbEntity !== undefined ? definitionFromDBEntity(dbEntity) : undefined;
    }

    private setDefinitionArchivedStatement(): Statement<
        { id: number, archivedAt: string | null, archivedBy: number | null, modifiedAt: string, modifiedBy: number },
        void
    > {
        return dbManager.db.prepare(`
            UPDATE clubAchievementDefinition
            SET archivedAt = :archivedAt,
                archivedBy = :archivedBy,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE id = :id
        `);
    }

    setDefinitionArchived(id: number, archived: boolean, modifiedBy: number, modifiedAt: Date): void {
        this.setDefinitionArchivedStatement().run({
            id,
            archivedAt: archived ? modifiedAt.toISOString() : null,
            archivedBy: archived ? modifiedBy : null,
            modifiedAt: modifiedAt.toISOString(),
            modifiedBy,
        });
    }

    private createAssignmentStatement(): Statement<{
        clubId: number;
        userId: number;
        builtInCode: string | null;
        definitionId: number | null;
        note: string | null;
        awardedAt: string;
        awardedBy: number;
    }, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO clubUserAchievement (clubId, userId, builtInCode, definitionId, note, awardedAt, awardedBy)
            VALUES (:clubId, :userId, :builtInCode, :definitionId, :note, :awardedAt, :awardedBy)
            RETURNING id
        `);
    }

    createAssignment(params: CreateAssignmentParams): ClubUserAchievement {
        const result = this.createAssignmentStatement().get({
            clubId: params.clubId,
            userId: params.userId,
            builtInCode: params.builtInCode,
            definitionId: params.definitionId,
            note: params.note,
            awardedAt: params.awardedAt.toISOString(),
            awardedBy: params.awardedBy,
        });
        return this.findAssignmentById(result!.id)!;
    }

    private findAssignmentByIdStatement(): Statement<{ id: number }, ClubUserAchievementDBEntity> {
        return dbManager.db.prepare(`${this.assignmentSelect} WHERE id = :id`);
    }

    findAssignmentById(id: number): ClubUserAchievement | undefined {
        const dbEntity = this.findAssignmentByIdStatement().get({ id });
        return dbEntity !== undefined ? assignmentFromDBEntity(dbEntity) : undefined;
    }

    private findActiveAssignmentByBuiltInCodeStatement(): Statement<
        { clubId: number, userId: number, builtInCode: string },
        ClubUserAchievementDBEntity
    > {
        return dbManager.db.prepare(`
            ${this.assignmentSelect}
            WHERE clubId = :clubId AND userId = :userId AND builtInCode = :builtInCode AND revokedAt IS NULL
        `);
    }

    findActiveAssignmentByBuiltInCode(
        clubId: number,
        userId: number,
        builtInCode: string
    ): ClubUserAchievement | undefined {
        const dbEntity = this.findActiveAssignmentByBuiltInCodeStatement().get({ clubId, userId, builtInCode });
        return dbEntity !== undefined ? assignmentFromDBEntity(dbEntity) : undefined;
    }

    private findActiveAssignmentByDefinitionIdStatement(): Statement<
        { clubId: number, userId: number, definitionId: number },
        ClubUserAchievementDBEntity
    > {
        return dbManager.db.prepare(`
            ${this.assignmentSelect}
            WHERE clubId = :clubId AND userId = :userId AND definitionId = :definitionId AND revokedAt IS NULL
        `);
    }

    findActiveAssignmentByDefinitionId(
        clubId: number,
        userId: number,
        definitionId: number
    ): ClubUserAchievement | undefined {
        const dbEntity = this.findActiveAssignmentByDefinitionIdStatement().get({ clubId, userId, definitionId });
        return dbEntity !== undefined ? assignmentFromDBEntity(dbEntity) : undefined;
    }

    private findAssignmentsByUserIdStatement(): Statement<{ userId: number }, ClubUserAchievementDBEntity> {
        return dbManager.db.prepare(
            `${this.assignmentSelect} WHERE userId = :userId AND revokedAt IS NULL ORDER BY awardedAt DESC`
        );
    }

    /** Earned, non-revoked assignments for a user across all clubs, for the profile page. */
    findActiveAssignmentsByUserId(userId: number): ClubUserAchievement[] {
        return this.findAssignmentsByUserIdStatement().all({ userId }).map(assignmentFromDBEntity);
    }

    private revokeAssignmentStatement(): Statement<
        { id: number, revokedAt: string, revokedBy: number },
        void
    > {
        return dbManager.db.prepare(`
            UPDATE clubUserAchievement
            SET revokedAt = :revokedAt, revokedBy = :revokedBy
            WHERE id = :id
        `);
    }

    revokeAssignment(id: number, revokedBy: number, revokedAt: Date): void {
        this.revokeAssignmentStatement().run({ id, revokedAt: revokedAt.toISOString(), revokedBy });
    }
}
