import fs from 'fs';
import path from 'path';

function findImportsInDirectory(dir: string): { file: string, line: string }[] {
    const results: { file: string, line: string }[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findImportsInDirectory(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                if (
                    (line.includes("from 'majiang-core'") ||
                        line.includes('from "@kobalab/majiang-core"') ||
                        line.includes("require('majiang-core')") ||
                        line.includes('require("@kobalab/majiang-core")')) &&
                    !fullPath.includes(path.join('src', 'mahjong'))
                ) {
                    results.push({ file: fullPath, line });
                }
            }
        }
    }

    return results;
}

describe('Mahjong Engine Import Boundary Guard', () => {
    it('ensures no file outside src/mahjong directly imports majiang-core', () => {
        const srcDir = path.resolve(process.cwd(), 'src');
        const violations = findImportsInDirectory(srcDir);
        expect(violations).toEqual([]);
    });
});
