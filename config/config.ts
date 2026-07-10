interface Config {
    env: string;
    port: number;
    dbPath: string;
    jwtSecret: string;
    jwtExpiry: string;
    authInitDataValiditySeconds: number;
    googleClientId: string | undefined;
    telegramLoginClientId: string | undefined;
    discordClientId: string | undefined;
    discordClientSecret: string | undefined;
    discordBrowserRedirectUri: string | undefined;
    frontendUrl: string;
    botUrl: string;
    botToken: string;
    globalLogsChatId: number | undefined;
    globalErrorLogsTopicId: number | undefined;
    globalUserLogsTopicId: number | undefined;
    globalGameLogsTopicId: number | undefined;
    globalClubLogsTopicId: number | undefined;
    telegramNotificationsEnabled: boolean;
    tournamentMode: boolean;
    tournamentUserId: number | undefined;
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

function getOptionalStringEnvVariable(varName: string): string | undefined {
    const value = process.env[varName]?.trim();
    return value === undefined || value.length === 0 ? undefined : value;
}

function parseBooleanEnvVariable(varName: string, defaultValue: boolean): boolean {
    const variable = process.env[varName];
    if (variable === undefined) {
        return defaultValue;
    }
    if (variable === 'true') {
        return true;
    }
    if (variable === 'false') {
        return false;
    }
    throw new Error(`${varName} environment variable must be either 'true' or 'false'`);
}

export function validateOptionalConfigGroup(groupName: string, values: Record<string, string | undefined>): void {
    const isConfigured = (value: string | undefined) => value !== undefined && value.trim().length > 0;
    const configuredValues = Object.entries(values).filter(([, value]) => isConfigured(value));
    if (configuredValues.length > 0 && configuredValues.length !== Object.keys(values).length) {
        const missingNames = Object.entries(values)
            .filter(([, value]) => !isConfigured(value))
            .map(([name]) => name)
            .join(', ');
        throw new Error(`${groupName} configuration is incomplete. Missing: ${missingNames}`);
    }
}

const env = getRequiredStringEnvVariable('NODE_ENV');

const globalLogsChatId = tryParseIntEnvVariable('GLOBAL_LOGS_CHAT_ID');

if (env === 'production') {
    if (globalLogsChatId === undefined) {
        throw new Error('GLOBAL_LOGS_CHAT_ID environment variable is required in production');
    }
}

const tournamentMode = process.env['TOURNAMENT_MODE'] === 'true';
const discordConfig = {
    DISCORD_CLIENT_ID: getOptionalStringEnvVariable('DISCORD_CLIENT_ID'),
    DISCORD_CLIENT_SECRET: getOptionalStringEnvVariable('DISCORD_CLIENT_SECRET'),
    DISCORD_BROWSER_REDIRECT_URI: getOptionalStringEnvVariable('DISCORD_BROWSER_REDIRECT_URI'),
};
validateOptionalConfigGroup('Discord', discordConfig);

const config: Config = {
    env: getRequiredStringEnvVariable('NODE_ENV'),
    port: tryParseIntEnvVariable('PORT') || 3000,
    dbPath: process.env['DB_PATH'] || './db/data/data.db',
    botToken: getRequiredStringEnvVariable('BOT_TOKEN'),
    jwtSecret: getRequiredStringEnvVariable('JWT_SECRET'),
    jwtExpiry: process.env['JWT_EXPIRY'] || '7d',
    authInitDataValiditySeconds: tryParseIntEnvVariable('AUTH_INIT_DATA_VALIDITY_SECONDS') || 86400,
    googleClientId: getOptionalStringEnvVariable('GOOGLE_CLIENT_ID'),
    telegramLoginClientId: getOptionalStringEnvVariable('TELEGRAM_LOGIN_CLIENT_ID'),
    discordClientId: discordConfig.DISCORD_CLIENT_ID,
    discordClientSecret: discordConfig.DISCORD_CLIENT_SECRET,
    discordBrowserRedirectUri: discordConfig.DISCORD_BROWSER_REDIRECT_URI,
    frontendUrl: getRequiredStringEnvVariable('FRONTEND_URL'),
    botUrl: getRequiredStringEnvVariable('BOT_URL'),
    globalLogsChatId: globalLogsChatId,
    globalErrorLogsTopicId: tryParseIntEnvVariable('GLOBAL_ERROR_LOGS_TOPIC_ID'),
    globalUserLogsTopicId: tryParseIntEnvVariable('GLOBAL_USER_LOGS_TOPIC_ID'),
    globalGameLogsTopicId: tryParseIntEnvVariable('GLOBAL_GAME_LOGS_TOPIC_ID'),
    globalClubLogsTopicId: tryParseIntEnvVariable('GLOBAL_CLUB_LOGS_TOPIC_ID'),
    telegramNotificationsEnabled: parseBooleanEnvVariable('TELEGRAM_NOTIFICATIONS_ENABLED', true),
    tournamentMode,
    tournamentUserId: tournamentMode ? (tryParseIntEnvVariable('TOURNAMENT_USER_ID') || 1) : undefined,
};

export default config;
