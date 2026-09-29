/**
 * Plays the issuing authorities: computes the digests of the macro source documents
 * and the custodian ledgers and writes data/synthetic/sources/registry.json.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '@hajj-zk/prover';
import { digestOf } from '../canonical.js';
import { loadMacroSources, SOURCE_FILES, SOURCES_DIR, type SourceKey, type SourceRegistry } from '../sources.js';

const sources = loadMacroSources();
const macro = Object.fromEntries(
  (Object.keys(SOURCE_FILES) as SourceKey[]).map((k) => [k, digestOf(sources[k])]),
) as SourceRegistry['macro'];

const ledgerDir = join(DATA_DIR, 'ledgers');
const ledgers: Record<string, string> = {};
for (const f of readdirSync(ledgerDir).filter((x) => x.endsWith('.json')).sort()) {
  ledgers[f.replace(/\.json$/, '')] = digestOf(JSON.parse(readFileSync(join(ledgerDir, f), 'utf8')));
}

const registry: SourceRegistry = { periodId: sources.regulatorStress.periodId, macro, ledgers };
writeFileSync(join(SOURCES_DIR, 'registry.json'), JSON.stringify(registry, null, 2) + '\n');
console.log(JSON.stringify(registry, null, 2));
