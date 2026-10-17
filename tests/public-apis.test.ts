import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { publicExports } from '@/lib/repository/exports';
import { architectureOverview } from '@/lib/architecture';
import { getSource } from '@/lib/repository';
import { vi } from 'vitest';
vi.stubEnv('MENTOR_DB_PATH', ':memory:');

describe('genuine module public APIs', () => {
  it('excludes internal helpers while retaining aliases, types, default and re-exports', () => {
    const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
    project.createSourceFile('/part.ts', 'const helper = 1;\nexport const value = 2;\nexport type Shape = number;\nexport default function run() {}');
    const source = project.createSourceFile('/entry.ts', [
      'const internal = () => 1;',
      'export const direct = 2;',
      'export { internal as publicAlias };',
      'export { value as renamed } from "./part";',
      'export * from "./part";',
      'export * as namespace from "./part";',
      'export default internal;',
    ].join('\n'));
    const apis = publicExports(source);
    expect(apis.map(item => item.name).sort()).toEqual(['Shape', 'default', 'direct', 'namespace', 'publicAlias', 'renamed', 'value'].sort());
    expect(apis.find(item => item.name === 'renamed')?.startLine).toBe(4);
    expect(apis.find(item => item.name === 'value')?.startLine).toBe(5);
    expect(apis.find(item => item.name === 'default')?.startLine).toBe(7);
    expect(apis.every(item => item.startLine >= 1 && item.endLine <= 7)).toBe(true);
  });
  it('keeps real architecture ranges valid and excludes private Zustand implementations', () => {
    const overview = architectureOverview();
    const store = overview.modules.find(module => module.id === 'store')!;
    expect(store.publicApis.map(api => api.name)).toContain('createStore');
    expect(store.publicApis.map(api => api.name)).not.toContain('createStoreImpl');
    const react = overview.modules.find(module => module.id === 'react')!;
    expect(react.publicApis.map(api => api.name)).toContain('useStore');
    expect(react.publicApis.map(api => api.name)).not.toContain('createImpl');
    const middleware = overview.modules.find(module => module.id === 'middleware')!;
    expect(middleware.publicApis.map(api => api.name)).toEqual(expect.arrayContaining(['combine', 'persist', 'redux']));
    for (const module of overview.modules) for (const api of module.publicApis) {
      expect(api.startLine).toBeGreaterThan(0);
      expect(api.endLine).toBeLessThanOrEqual(getSource(module.fileId).lines.length);
    }
  });
});
