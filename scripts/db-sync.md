# Database Sync Scripts

Scripts for syncing SQLite database between local and remote server using SSH/SCP.

## Quick Usage

```bash
# Pull database from remote server
SSH_HOST=host_ip SSH_USERNAME=root npm run db:pull

# Push database to remote server
SSH_HOST=host_ip SSH_USERNAME=root npm run db:push
```

## Configuration

Add to your `.env.development` or use environment variables:

```bash
SSH_HOST=your-server.com
SSH_USERNAME=user
SSH_PORT=22
REMOTE_DB_PATH=~/app/db/data/data.db
REMOTE_BACKUP_DIR=~/app/db/backups
LOCAL_DB_NAME=data.db  # Optional: specify exact file for push, or auto-timestamp for pull
```

## Commands

### `npm run db:pull`

Downloads database from remote server to local `db/data/` directory.

- Creates timestamped file: `data-YYYY-MM-DD_HH-MM-SS.db`
- Override filename: `LOCAL_DB_NAME=custom.db npm run db:pull`

### `npm run db:push`

Uploads local database to remote server.

- Interactive: shows list of available databases to select
- Direct mode: `LOCAL_DB_NAME=data-2026-01-24_09-30-45.db npm run db:push`
- Automatically backs up remote database before overwriting
- Requires confirmation before upload

## Requirements

- SSH key authentication configured with remote server
- OpenSSH client installed (scp, ssh)
