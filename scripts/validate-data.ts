/**
 * Validates every catalog and change-log JSON file against the contract
 * (including cross-reference and honesty rules that JSON Schema cannot express).
 *
 * Usage: npm run validate            (all files in public/data/catalog and examples/)
 *        npm run validate -- file.json
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MarsCatalog, TerrainChangeLog } from '../src/contract';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function listJson(dir: string) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
  } catch {
    return [];
  }
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...(await listJson(join(ROOT, 'public/data/catalog'))), ...(await listJson(join(ROOT, 'examples')))];

let failed = 0;
for (const file of files) {
  const doc = JSON.parse(await readFile(file, 'utf8'));
  const schema = 'versions' in doc ? TerrainChangeLog : MarsCatalog;
  const res = schema.safeParse(doc);
  if (res.success) {
    console.log('✔', file);
  } else {
    failed++;
    console.log('✘', file);
    for (const issue of res.error.issues) console.log('   ', issue.path.join('.') || '(root)', '→', issue.message);
  }
}
process.exit(failed ? 1 : 0);
