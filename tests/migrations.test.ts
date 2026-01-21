import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database Migrations', () => {
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

  test('migration files should not contain CURRENT_TIMESTAMP', () => {
    // Read all files in the migrations directory
    const files = fs.readdirSync(migrationsDir);
    const sqlFiles = files.filter(file => file.endsWith('.sql'));

    expect(sqlFiles.length).toBeGreaterThan(0); // Ensure we have migration files to test

    const filesWithCurrentTimestamp: string[] = [];

    sqlFiles.forEach(file => {
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      if (content.includes('CURRENT_TIMESTAMP')) {
        filesWithCurrentTimestamp.push(file);
      }
    });

    expect(filesWithCurrentTimestamp).toEqual([]);
  });
});
