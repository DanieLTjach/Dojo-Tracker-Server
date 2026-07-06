import fs from 'fs';
import path from 'path';

export interface MigrationFile {
    version: number;
    description: string;
    fileName: string;
    path: string;
}

const migrationFilePattern = /^(\d{3})_([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.sql$/;

export function getMigrationFiles(migrationsDir: string): MigrationFile[] {
    if (!fs.existsSync(migrationsDir)) {
        return [];
    }

    const migrations = fs.readdirSync(migrationsDir)
        .filter(fileName => fileName.endsWith('.sql'))
        .map(fileName => parseMigrationFileName(fileName, migrationsDir))
        .sort((a, b) => a.version - b.version);

    validateMigrationVersions(migrations);

    return migrations;
}

export function parseMigrationFileName(fileName: string, migrationsDir: string): MigrationFile {
    const match = migrationFilePattern.exec(fileName);
    if (match === null) {
        throw new Error(
            `Invalid migration filename "${fileName}". Expected format: NNN_description.sql`
        );
    }

    const version = Number.parseInt(match[1]!, 10);
    if (version < 1) {
        throw new Error(`Invalid migration version "${match[1]}" in "${fileName}". Versions must start at 001`);
    }

    return {
        version,
        description: match[2]!,
        fileName,
        path: path.join(migrationsDir, fileName),
    };
}

function validateMigrationVersions(migrations: MigrationFile[]) {
    const seenVersions = new Map<number, string>();

    for (const [index, migration] of migrations.entries()) {
        const duplicateFile = seenVersions.get(migration.version);
        if (duplicateFile !== undefined) {
            throw new Error(
                `Duplicate migration version ${migration.version}: ${duplicateFile} and ${migration.fileName}`
            );
        }
        seenVersions.set(migration.version, migration.fileName);

        const expectedVersion = index + 1;
        if (migration.version !== expectedVersion) {
            throw new Error(
                `Missing migration version ${expectedVersion}. Found ${migration.fileName} with version ${migration.version}`
            );
        }
    }
}
