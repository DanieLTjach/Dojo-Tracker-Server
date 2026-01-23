interface Config {
    env: string;
    port: number;
    dbPath: string;
    jwtSecret: string;
    jwtExpiry: string;
    authInitDataValiditySeconds: number;
    frontendUrl: string;
    botToken: string;
    adminChatId?: number | undefined;
    ratingChatId?: number | undefined;
    ratingTopicId?: number | undefined;
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

const env = getRequiredStringEnvVariable("NODE_ENV");

const adminChatId = tryParseIntEnvVariable("ADMIN_CHAT_ID");
const ratingChatId = tryParseIntEnvVariable("RATING_CHAT_ID");
const ratingTopicId = tryParseIntEnvVariable("RATING_TOPIC_ID");

if (env === 'production') {
    if (adminChatId === undefined) {
        throw new Error("ADMIN_CHAT_ID environment variable is required in production");
    }
    if (ratingChatId === undefined) {
        throw new Error("RATING_CHAT_ID environment variable is required in production");
    }
    if (ratingTopicId === undefined) {
        throw new Error("RATING_TOPIC_ID environment variable is required in production");
    }
}

if (!process.env["FRONTEND_URL"]) {
    throw new Error("FRONTEND_URL environment variable is required");
}

const config: Config = {
    env: getRequiredStringEnvVariable("NODE_ENV"),
    port: tryParseIntEnvVariable("PORT") || 3000,
    dbPath: process.env["DB_PATH"] || './db/data/data.db',
    botToken: getRequiredStringEnvVariable("BOT_TOKEN"),
    jwtSecret: getRequiredStringEnvVariable("JWT_SECRET"),
    jwtExpiry: process.env["JWT_EXPIRY"] || '7d',
    authInitDataValiditySeconds: tryParseIntEnvVariable("AUTH_INIT_DATA_VALIDITY_SECONDS") || 3600,
    frontendUrl: process.env["FRONTEND_URL"],
    adminChatId,
    ratingChatId,
    ratingTopicId
};

export default config;