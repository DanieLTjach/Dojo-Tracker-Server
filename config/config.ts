interface Config {
    port: number;
    db_path: string;
}

const config: Config = {
    port: Number(process.env["PORT"]) || 3000,
    db_path: process.env["DB_PATH"] || './db/data/data.db'
};

export default config;