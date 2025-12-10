var config = {}

config.port = process.env.PORT || 3000
config.db_path = process.env.DB_PATH || './db/data/data.db'

module.exports = config