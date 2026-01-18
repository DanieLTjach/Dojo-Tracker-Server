export function dateToSqliteString(date: Date): string {
    // Use ISO 8601 format to match existing database data
    return date.toISOString();
}

export function dateFromSqliteString(dateString: string): Date {
    // Handle both SQLite format (YYYY-MM-DD HH:MM:SS) and ISO 8601 format (YYYY-MM-DDTHH:MM:SS.sssZ)
    if (dateString.includes('T')) {
        // Already in ISO 8601 format
        return new Date(dateString);
    }
    // Convert SQLite format to ISO 8601
    const utcDateString = dateString.split(' ').join('T') + 'Z';
    return new Date(utcDateString);
}

export function booleanToInteger(value: boolean): number {
    return value ? 1 : 0;
}