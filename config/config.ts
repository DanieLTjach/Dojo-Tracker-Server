interface Config {
    port: number;
    dbPath: string;
}

const config: Config = {
    port: Number(process.env["PORT"]) || 3000,
    dbPath: process.env["DB_PATH"] || './db/data/data.db'
};

export default config;