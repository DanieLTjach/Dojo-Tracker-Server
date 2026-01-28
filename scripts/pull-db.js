#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Generate timestamp for filename
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

// Configuration
const config = {
  sshUser: process.env.SSH_USERNAME || 'user',
  sshHost: process.env.SSH_HOST || 'your-server.com',
  sshPort: process.env.SSH_PORT || '22',
  remoteDbPath: process.env.REMOTE_DB_PATH || '~/app/db/data/data.db',
  localDbDir: path.join(projectRoot, 'db', 'data'),
  localDbName: process.env.LOCAL_DB_NAME || `data-${getTimestamp()}.db`,
};

// Color output for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function ensureLocalDbDir() {
  if (!existsSync(config.localDbDir)) {
    log(`Creating directory: ${config.localDbDir}`, colors.yellow);
    mkdirSync(config.localDbDir, { recursive: true });
  }
}

async function syncDatabase() {
  try {
    log('\n🔄 Starting database sync from remote server...', colors.cyan);
    log(`Remote: ${config.sshUser}@${config.sshHost}:${config.remoteDbPath}`, colors.bright);

    // Ensure local directory exists
    await ensureLocalDbDir();

    const localDbPath = path.join(config.localDbDir, config.localDbName);
    log(`Local:  ${localDbPath}`, colors.bright);

    // First, checkpoint the WAL on remote to consolidate all changes into main db file
    log('\n🔄 Checkpointing WAL on remote server...', colors.yellow);
    const checkpointCommand = `ssh -p ${config.sshPort} ${config.sshUser}@${config.sshHost} "sqlite3 ${config.remoteDbPath} 'PRAGMA wal_checkpoint(TRUNCATE);'"`;

    try {
      await execAsync(checkpointCommand);
      log('✓ WAL checkpoint completed', colors.green);
    } catch (error) {
      log('⚠️  WAL checkpoint failed, continuing anyway...', colors.yellow);
    }

    // Build SCP command
    const scpCommand = [
      'scp',
      `-P ${config.sshPort}`,
      `${config.sshUser}@${config.sshHost}:${config.remoteDbPath}`,
      localDbPath,
    ].join(' ');

    log('\n📦 Executing SCP command...', colors.yellow);

    // Execute SCP command
    const { stdout, stderr} = await execAsync(scpCommand);

    if (stderr && !stderr.includes('Warning')) {
      log(`\nWarnings: ${stderr}`, colors.yellow);
    }

    if (stdout) {
      log(stdout, colors.reset);
    }

    log('\n✅ Database synced successfully!', colors.green);
    log(`\n💾 Database saved to: ${localDbPath}`, colors.cyan);

  } catch (error) {
    log('\n❌ Error syncing database:', colors.red);

    if (error.code === 'ENOENT') {
      log('SCP command not found. Please ensure OpenSSH is installed.', colors.red);
    } else if (error.stderr) {
      log(error.stderr, colors.red);
    } else {
      log(error.message, colors.red);
    }

    log('\n💡 Troubleshooting tips:', colors.yellow);
    log('1. Ensure you have SSH access to the remote server', colors.reset);
    log('2. Verify your SSH key is added to the remote server', colors.reset);
    log('3. Check that the remote database path is correct', colors.reset);
    log('4. Set environment variables: SSH_HOST, SSH_USERNAME, SSH_PORT, REMOTE_DB_PATH', colors.reset);

    process.exit(1);
  }
}

// Show configuration
log('\n📋 Configuration:', colors.bright);
log(`  SSH User:      ${config.sshUser}`, colors.reset);
log(`  SSH Host:      ${config.sshHost}`, colors.reset);
log(`  SSH Port:      ${config.sshPort}`, colors.reset);
log(`  Remote DB:     ${config.remoteDbPath}`, colors.reset);
log(`  Local Dir:     ${config.localDbDir}`, colors.reset);
log(`  Local DB Name: ${config.localDbName}`, colors.reset);

// Run sync
syncDatabase();
