#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Generate timestamp for backup filename
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
  remoteBackupDir: process.env.REMOTE_BACKUP_DIR || '~/app/db/backups',
  localDbDir: path.join(projectRoot, 'db', 'data'),
  localDbName: process.env.LOCAL_DB_NAME || null, // Will prompt if not set
};

// Color output for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Get list of database files in local directory
function getLocalDatabaseFiles() {
  if (!existsSync(config.localDbDir)) {
    return [];
  }

  const files = readdirSync(config.localDbDir)
    .filter(file => file.endsWith('.db'))
    .map(file => {
      const filePath = path.join(config.localDbDir, file);
      const stats = statSync(filePath);
      return {
        name: file,
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
      };
    })
    .sort((a, b) => b.modified - a.modified); // Most recent first

  return files;
}

// Prompt user to select a database file
function selectDatabaseFile() {
  return new Promise((resolve, reject) => {
    const files = getLocalDatabaseFiles();

    if (files.length === 0) {
      reject(new Error(`No database files found in ${config.localDbDir}`));
      return;
    }

    log('\n📁 Available database files:', colors.cyan);
    files.forEach((file, index) => {
      const sizeKB = (file.size / 1024).toFixed(2);
      const date = file.modified.toLocaleString();
      log(`  ${index + 1}. ${file.name} (${sizeKB} KB, modified: ${date})`, colors.reset);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`\n${colors.yellow}Select database file (1-${files.length}): ${colors.reset}`, (answer) => {
      rl.close();
      const index = parseInt(answer) - 1;

      if (isNaN(index) || index < 0 || index >= files.length) {
        reject(new Error('Invalid selection'));
        return;
      }

      resolve(files[index]);
    });
  });
}

// Confirm upload action
function confirmUpload(localFile) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    log(`\n⚠️  WARNING: This will replace the remote database!`, colors.red);
    log(`Local:  ${localFile.name}`, colors.bright);
    log(`Remote: ${config.sshUser}@${config.sshHost}:${config.remoteDbPath}`, colors.bright);
    log(`\nA backup will be created at: ${config.remoteBackupDir}/data-backup-${getTimestamp()}.db`, colors.yellow);

    rl.question(`\n${colors.yellow}Are you sure you want to continue? (yes/no): ${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function uploadDatabase() {
  try {
    log('\n📤 Starting database upload to remote server...', colors.cyan);

    // Select or use specified database file
    let localFile;
    if (config.localDbName) {
      const localDbPath = path.join(config.localDbDir, config.localDbName);
      if (!existsSync(localDbPath)) {
        throw new Error(`Database file not found: ${localDbPath}`);
      }
      const stats = statSync(localDbPath);
      localFile = {
        name: config.localDbName,
        path: localDbPath,
        size: stats.size,
        modified: stats.mtime,
      };
      log(`Using specified file: ${localFile.name}`, colors.bright);
    } else {
      localFile = await selectDatabaseFile();
    }

    // Confirm upload
    const confirmed = await confirmUpload(localFile);
    if (!confirmed) {
      log('\n❌ Upload cancelled by user', colors.yellow);
      process.exit(0);
    }

    log('\n📦 Step 1: Creating backup of remote database...', colors.yellow);

    // Create backup directory on remote server
    const backupFilename = `data-backup-${getTimestamp()}.db`;
    const createBackupDirCommand = `ssh -p ${config.sshPort} ${config.sshUser}@${config.sshHost} "mkdir -p ${config.remoteBackupDir}"`;
    await execAsync(createBackupDirCommand);

    // Backup existing remote database
    const backupCommand = `ssh -p ${config.sshPort} ${config.sshUser}@${config.sshHost} "cp ${config.remoteDbPath} ${config.remoteBackupDir}/${backupFilename}"`;

    try {
      await execAsync(backupCommand);
      log(`✓ Backup created: ${config.remoteBackupDir}/${backupFilename}`, colors.green);
    } catch (error) {
      if (error.stderr && error.stderr.includes('No such file')) {
        log(`⚠️  No existing remote database found (this might be the first upload)`, colors.yellow);
      } else {
        throw error;
      }
    }

    log('\n📤 Step 2: Uploading database to remote server...', colors.yellow);

    // Upload database using SCP
    const scpCommand = [
      'scp',
      `-P ${config.sshPort}`,
      localFile.path,
      `${config.sshUser}@${config.sshHost}:${config.remoteDbPath}`,
    ].join(' ');

    const { stdout, stderr } = await execAsync(scpCommand);

    if (stderr && !stderr.includes('Warning')) {
      log(`\nWarnings: ${stderr}`, colors.yellow);
    }

    if (stdout) {
      log(stdout, colors.reset);
    }

    log('\n✅ Database uploaded successfully!', colors.green);
    log(`\n💾 Remote database updated: ${config.remoteDbPath}`, colors.cyan);
    log(`🔒 Backup saved at: ${config.remoteBackupDir}/${backupFilename}`, colors.cyan);

  } catch (error) {
    log('\n❌ Error uploading database:', colors.red);

    if (error.code === 'ENOENT') {
      log('SCP/SSH command not found. Please ensure OpenSSH is installed.', colors.red);
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
log(`  SSH User:         ${config.sshUser}`, colors.reset);
log(`  SSH Host:         ${config.sshHost}`, colors.reset);
log(`  SSH Port:         ${config.sshPort}`, colors.reset);
log(`  Remote DB:        ${config.remoteDbPath}`, colors.reset);
log(`  Remote Backup:    ${config.remoteBackupDir}`, colors.reset);
log(`  Local Dir:        ${config.localDbDir}`, colors.reset);

// Run upload
uploadDatabase();
