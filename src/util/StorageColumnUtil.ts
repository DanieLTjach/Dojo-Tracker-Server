import type { Database } from 'better-sqlite3';

export interface StorageColumn {
    table: string;
    column: string;
}

/**
 * Column names that can hold an image URL. Matched case-insensitively against
 * every TEXT column in the schema.
 *
 * Discovering these from the schema rather than listing the columns themselves
 * is deliberate: the orphan cleanup treats "no row references this object" as
 * permission to delete, so a column the scan does not know about would get its
 * images deleted while they are still in use. A new field is found automatically
 * as long as it is named like the existing ones.
 */
const IMAGE_COLUMN_PATTERNS = ['url', 'icon', 'image', 'photo', 'avatar', 'logo'];

function isImageColumn(name: string): boolean {
    const lower = name.toLowerCase();
    return IMAGE_COLUMN_PATTERNS.some(pattern => lower.includes(pattern));
}

/**
 * Every TEXT column in the database whose name suggests it holds an image URL.
 *
 * Derived from `sqlite_master` at runtime so adding an image field to a
 * migration is enough - there is no second list to keep in step.
 */
export function findImageColumns(db: Database): StorageColumn[] {
    const rows = db
        .prepare(
            `SELECT m.name AS tableName, p.name AS columnName, p.type AS columnType
             FROM sqlite_master m
             JOIN pragma_table_info(m.name) p
             WHERE m.type = 'table'
               AND m.name NOT LIKE 'sqlite_%'
             ORDER BY m.name, p.name`
        )
        .all() as { tableName: string, columnName: string, columnType: string }[];

    return rows
        .filter(row => (row.columnType ?? '').toUpperCase().startsWith('TEXT'))
        .filter(row => isImageColumn(row.columnName))
        .map(row => ({ table: row.tableName, column: row.columnName }));
}
