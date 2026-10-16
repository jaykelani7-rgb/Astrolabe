import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getSnapshot, getSource, listFiles, listSymbols, listSnapshots } from '@/lib/repository';
import { MAX_CONTEXT_CHARACTERS, MAX_CONTEXT_CHUNKS, retrieveContext } from '@/lib/retrieval';
import type { QuestionInput } from '@/contracts';

beforeEach(() => vi.stubEnv('MENTOR_DB_PATH', ':memory:'));
afterEach(() => vi.unstubAllEnvs());
const retrieve = (question: string, extra: Partial<QuestionInput> = {}) => retrieveContext({
  question, snapshotId: getSnapshot().snapshotId, scope: 'repository', ...extra,
});
const paths = (result: ReturnType<typeof retrieve>) => result.evidence.map(e => getSource(e.fileId, e.snapshotId).file.path);

describe('definition-first source context', () => {
  it('finds nested store implementations before middleware references', () => {
    const context = retrieve('Explain the setState identity guard');
    expect(paths(context).every(path => path === 'src/vanilla.ts')).toBe(true);
    expect(context.evidence[0].text).toContain('Object.is(nextState, state)');
    expect(context.evidence[0].text).toContain('listener(state, previousState)');
    const vanilla = listFiles().find(file => file.path === 'src/vanilla.ts')!;
    expect(listSymbols(vanilla.fileId)).toContainEqual(expect.objectContaining({ name: 'setState', topLevel: false, runtime: true }));
  });
  it('distinguishes an implemented function from overload signatures and the traditional entry point', () => {
    const context = retrieve('Explain the selector callback in useStore');
    expect(paths(context).every(path => path === 'src/react.ts')).toBe(true);
    expect(context.evidence[0].text).toContain('React.useSyncExternalStore(');
    expect(context.evidence[0].text).toContain('selector(api.getState())');
  });
  it('uses an explicit module name to disambiguate same-named local helpers', () => {
    const context = retrieve('Explain createImpl in React');
    expect(paths(context).every(path => path === 'src/react.ts')).toBe(true);
    expect(context.evidence[0].text).toContain('Object.assign(useBoundStore, api)');
  });
  it('respects an explicitly named middleware module when it overrides a core API property', () => {
    const context = retrieve('How does immer middleware replace setState?');
    expect(paths(context).every(path => path === 'src/middleware/immer.ts')).toBe(true);
    expect(context.evidence.some(e => e.text.includes('store.setState ='))).toBe(true);
  });
  it('can select the traditional entry point rather than the similarly named React helper', () => {
    const context = retrieve('Explain createImpl in traditional');
    expect(paths(context).every(path => path === 'src/traditional.ts')).toBe(true);
    expect(context.evidence.some(e => e.text.includes('useStoreWithEqualityFn'))).toBe(true);
  });
  it('keeps both definitions when an explicit React connection names a vanilla API', () => {
    const context = retrieve('How do React useStore and createStore connect?');
    expect(paths(context)).toContain('src/react.ts');
    expect(paths(context)).toContain('src/vanilla.ts');
  });
  it('follows a bounded same-file implementation alias', () => {
    const context = retrieve('Explain subscribeWithSelector');
    expect(paths(context).every(path => path === 'src/middleware/subscribeWithSelector.ts')).toBe(true);
    expect(context.evidence.some(e => e.text.includes('options?.equalityFn || Object.is'))).toBe(true);
  });
  it('can retrieve a named entry file whose export statements do not contain the word index', () => {
    const context = retrieve('What is exported by the main index?');
    expect(paths(context)).toContain('src/index.ts');
    expect(context.evidence[0].text).toContain("export * from './vanilla.ts'");
  });
  it('retains cross-file evidence for questions naming a connection', () => {
    const context = retrieve('How do useStore and createStore connect?');
    expect(paths(context)).toContain('src/react.ts');
    expect(paths(context)).toContain('src/vanilla.ts');
    expect(context.evidence.length).toBeLessThanOrEqual(MAX_CONTEXT_CHUNKS);
    expect(context.evidence.reduce((n, e) => n + e.text.length, 0)).toBeLessThanOrEqual(MAX_CONTEXT_CHARACTERS);
  });
  it('does not broaden exact selections to include a named implementation', () => {
    const file = listFiles().find(file => file.path === 'src/react.ts')!;
    const context = retrieve('Explain createStore and setState', { scope: 'selection', fileId: file.fileId, startLine: 1, endLine: 2 });
    expect(context.evidence).toHaveLength(1);
    expect(context.evidence[0]).toMatchObject({ fileId: file.fileId, startLine: 1, endLine: 2 });
    expect(context.evidence[0].text).not.toContain('const setState');
  });
  it('keeps a file-scoped question inside the selected file even when another file defines the symbol', () => {
    const file = listFiles().find(file => file.path === 'src/react.ts')!;
    const context = retrieve('Explain setState', { scope: 'file', fileId: file.fileId });
    expect(context.evidence.every(e => e.fileId === file.fileId)).toBe(true);
  });
  it('keeps definition lookup isolated in a second prepared repository', () => {
    const snapshot = listSnapshots().find(snapshot => snapshot.name.toLowerCase().includes('mitt'))!;
    const context = retrieve('Explain mitt', { snapshotId: snapshot.snapshotId });
    expect(context.evidence.length).toBeGreaterThan(0);
    expect(context.evidence.every(e => e.snapshotId === snapshot.snapshotId)).toBe(true);
    expect(paths(context).every(path => path === 'src/index.ts')).toBe(true);
  });
});
