import 'server-only';
import { ts } from 'ts-morph';
import type { Evidence } from '@/contracts';
import { MAX_CONTEXT_CHARACTERS } from '@/lib/retrieval';

export interface SourceMechanism {
  evidenceId: string;
  kind: 'condition' | 'assignment' | 'binding' | 'call';
  startLine: number;
  endLine: number;
  code: string;
}

/** Literal syntax from supplied excerpts only; this is a reading aid, not claim verification. */
export function sourceMechanisms(evidence: Evidence[]): SourceMechanism[] {
  const candidates: SourceMechanism[] = [];
  const seen = new Set<string>();
  for (const item of evidence) {
    const source = ts.createSourceFile('excerpt.ts', item.text, ts.ScriptTarget.Latest, true);
    // Partial windows need not be valid standalone syntax. Do not infer missing syntax.
    if ((source as typeof source & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) continue;
    function add(kind: SourceMechanism['kind'], node: ts.Node) {
      const code = node.getText(source);
      const startLine = item.startLine + source.getLineAndCharacterOfPosition(node.getStart(source)).line;
      const endLine = item.startLine + source.getLineAndCharacterOfPosition(node.getEnd() - 1).line;
      const key = `${item.fileId}:${startLine}:${kind}:${code}`;
      if (code.length > 320 || endLine > item.endLine || seen.has(key)) return;
      seen.add(key);
      candidates.push({ evidenceId: item.evidenceId, kind, startLine, endLine, code });
    }
    function visit(node: ts.Node) {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (ts.isIfStatement(node)) add('condition', node.expression);
      if (ts.isConditionalExpression(node)) add('condition', node.condition);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) add('assignment', node);
      if (ts.isVariableDeclaration(node) && node.initializer) add('binding', node);
      if (ts.isCallExpression(node)) add('call', node);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const priority = { condition: 0, assignment: 1, call: 2, binding: 3 };
  let remaining = Math.min(1800, Math.max(0, MAX_CONTEXT_CHARACTERS - evidence.reduce((n, e) => n + e.text.length, 0)));
  return candidates.sort((a, b) => priority[a.kind] - priority[b.kind]).filter(item => {
    if (item.code.length > remaining) return false;
    remaining -= item.code.length;
    return true;
  }).slice(0, 20);
}
