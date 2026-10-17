import type { Node, SourceFile } from 'ts-morph';

export interface PublicApi { name: string; startLine: number; endLine: number }
/** Export names from the compiler's module table; ranges always point into this module. */
export function publicExports(source: SourceFile): PublicApi[] {
  const result: PublicApi[] = [];
  for (const [name, declarations] of source.getExportedDeclarations()) {
    let anchor: Node | undefined;
    for (const statement of source.getExportDeclarations()) {
      const named = statement.getNamedExports().find(specifier => (specifier.getAliasNode()?.getText() ?? specifier.getName()) === name);
      if (named || statement.getNamespaceExport()?.getName() === name) { anchor = statement; break; }
    }
    if (!anchor && name === 'default') anchor = source.getExportAssignments()[0];
    anchor ??= declarations.find(declaration => declaration.getSourceFile() === source);
    if (!anchor) anchor = source.getExportDeclarations().find(statement => !statement.getNamedExports().length && !statement.getNamespaceExport()
      && name !== 'default' && statement.getModuleSpecifierSourceFile()?.getExportedDeclarations().has(name));
    if (anchor) result.push({ name, startLine: anchor.getStartLineNumber(), endLine: anchor.getEndLineNumber() });
  }
  return result.sort((a, b) => a.startLine - b.startLine || a.name.localeCompare(b.name));
}
