/**
 * Generates JSON Schema files from the Zod contract (src/contract) so non-TypeScript
 * teammates/tools (ChatGPT, Python ingest, PostGIS loaders) can validate documents.
 *
 * Usage: npm run schema
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MarsCatalog, TerrainChangeLog, ChangeProposal } from '../src/contract';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'schema');
await mkdir(OUT, { recursive: true });

const docs = {
  'mars-catalog.schema.json': MarsCatalog,
  'terrain-changelog.schema.json': TerrainChangeLog,
  'change-proposal.schema.json': ChangeProposal,
};
for (const [file, schema] of Object.entries(docs)) {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any', io: 'input' });
  await writeFile(join(OUT, file), JSON.stringify(json, null, 2));
  console.log('wrote schema/' + file);
}
