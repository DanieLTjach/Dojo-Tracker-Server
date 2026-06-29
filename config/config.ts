interface Config {
    env: string;
    port: number;
    dbPath: string;
    jwtSecret: string;
    jwtExpiry: string;
    authInitDataValiditySeconds: number;
    frontendUrl: string;
    botUrl: string;
    botToken: string;
    globalLogsChatId: number | undefined;
    globalErrorLogsTopicId: number | undefined;
    globalUserLogsTopicId: number | undefined;
    globalGameLogsTopicId: number | undefined;
    globalClubLogsTopicId: number | undefined;
    tournamentMode: boolean;
    tournamentUserId: number | undefined;
    redisUrl: string | undefined;
    usageStartingCredits: number;
    usageNewClubStartingCredits: number;
    usageDefaultOverdraftCutoff: number;
    usageDefaultOverdraftMultiplier: number;
    usageReservationTtlSeconds: number;
    usageFlushCron: string;
}

function getRequiredStringEnvVariable(varName: string): string {
    const variable = process.env[varName];
    if (!variable) {
        throw new Error(`${varName} environment variable is required`);
    }
    return variable;
}

function tryParseIntEnvVariable(varName: string): number | undefined {
    const variable = process.env[varName];
    if (!variable) {
        return undefined;
    }
    const intValue = Number(variable);
    if (isNaN(intValue)) {
        throw new Error(`${varName} environment variable must be a valid integer`);
    }
    return intValue;
}

const env = getRequiredStringEnvVariable('NODE_ENV');

const globalLogsChatId = tryParseIntEnvVariable('GLOBAL_LOGS_CHAT_ID');

if (env === 'production') {
    if (globalLogsChatId === undefined) {
        throw new Error('GLOBAL_LOGS_CHAT_ID environment variable is required in production');
    }
}

const tournamentMode = process.env['TOURNAMENT_MODE'] === 'true';

const config: Config = {
    env: getRequiredStringEnvVariable('NODE_ENV'),
    port: tryParseIntEnvVariable('PORT') || 3000,
    dbPath: process.env['DB_PATH'] || './db/data/data.db',
    botToken: getRequiredStringEnvVariable('BOT_TOKEN'),
    jwtSecret: getRequiredStringEnvVariable('JWT_SECRET'),
    jwtExpiry: process.env['JWT_EXPIRY'] || '7d',
    authInitDataValiditySeconds: tryParseIntEnvVariable('AUTH_INIT_DATA_VALIDITY_SECONDS') || 86400,
    frontendUrl: getRequiredStringEnvVariable('FRONTEND_URL'),
    botUrl: getRequiredStringEnvVariable('BOT_URL'),
    globalLogsChatId: globalLogsChatId,
    globalErrorLogsTopicId: tryParseIntEnvVariable('GLOBAL_ERROR_LOGS_TOPIC_ID'),
    globalUserLogsTopicId: tryParseIntEnvVariable('GLOBAL_USER_LOGS_TOPIC_ID'),
    globalGameLogsTopicId: tryParseIntEnvVariable('GLOBAL_GAME_LOGS_TOPIC_ID'),
    globalClubLogsTopicId: tryParseIntEnvVariable('GLOBAL_CLUB_LOGS_TOPIC_ID'),
    tournamentMode,
    tournamentUserId: tournamentMode ? (tryParseIntEnvVariable('TOURNAMENT_USER_ID') || 1) : undefined,
    redisUrl: process.env['REDIS_URL'],
    usageStartingCredits: tryParseIntEnvVariable('USAGE_STARTING_CREDITS') ?? 10000,
    usageNewClubStartingCredits: tryParseIntEnvVariable('USAGE_NEW_CLUB_STARTING_CREDITS') ?? 1000,
    usageDefaultOverdraftCutoff: tryParseIntEnvVariable('USAGE_DEFAULT_OVERDRAFT_CUTOFF') ?? -1000,
    usageDefaultOverdraftMultiplier: tryParseIntEnvVariable('USAGE_DEFAULT_OVERDRAFT_MULTIPLIER') ?? 2,
    usageReservationTtlSeconds: tryParseIntEnvVariable('USAGE_RESERVATION_TTL_SECONDS') ?? 300,
    usageFlushCron: process.env['USAGE_FLUSH_CRON'] || '* * * * *',
};

export default config;
