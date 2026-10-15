/**
 * Validate the bundled, immutable snapshot and populate SQLite source evidence.
 * No code, dependency lifecycle hooks, or configuration from Zustand is executed.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { getMap, getSnapshot, listFiles, listSymbols, searchEvidence } from '../src/lib/repository';

const snapshot = getSnapshot();
const files = listFiles();
const moduleMap = getMap();
const sourceRoot = path.join(process.cwd(), 'data', 'snapshot');
const license = readFileSync(path.join(sourceRoot, 'LICENSE'), 'utf8');
if (!license.includes('MIT License') || !license.includes('Permission is hereby granted')) throw new Error('The source snapshot must retain its MIT license.');
const manifest = JSON.parse(readFileSync(path.join(sourceRoot, 'manifest.json'), 'utf8')) as { licenseSha256: string };
if (createHash('sha256').update(license).digest('hex') !== manifest.licenseSha256) throw new Error('License integrity check failed.');
const evidence = searchEvidence('setState subscribe useSyncExternalStore', { limit: 3 });
if (!evidence.length) throw new Error('Full-text source evidence indexing failed.');
console.log(JSON.stringify({ snapshotId: snapshot.snapshotId, commitSha: snapshot.commitSha, files: files.length, lines: files.reduce((n, file) => n + file.lineCount, 0), symbols: listSymbols().length, imports: moduleMap.edges.length, externalReferences: moduleMap.unresolved.length, searchChunks: evidence.length, database: process.env.MENTOR_DB_PATH || 'data/mentor.sqlite' }, null, 2));
