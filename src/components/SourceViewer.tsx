"use client";
import { useEffect, useRef } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import type { SourceDocument } from "@/contracts";
loader.config({ paths: { vs: "/monaco/vs" } });
export function SourceViewer({
  document,
  range,
  onSelect,
}: {
  document: SourceDocument | null;
  range: { startLine: number; endLine: number } | null;
  onSelect: (startLine: number, endLine: number) => void;
}) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationRef = useRef<editor.IEditorDecorationsCollection | null>(
    null,
  );
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  function highlight() {
    const ed = editorRef.current;
    if (!ed) return;
    decorationRef.current?.clear();
    if (range) {
      decorationRef.current = ed.createDecorationsCollection([
        {
          range: {
            startLineNumber: range.startLine,
            startColumn: 1,
            endLineNumber: range.endLine,
            endColumn: 1000,
          },
          options: {
            isWholeLine: true,
            className: "source-highlight",
            linesDecorationsClassName: "source-line-marker",
          },
        },
      ]);
      ed.revealLineInCenter(range.startLine);
    }
  }
  useEffect(highlight, [range, document]);
  const onMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monaco.editor.defineTheme("mentor", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "747E8E" },
        { token: "keyword", foreground: "C6A9EB" },
        { token: "string", foreground: "B4CB91" },
        { token: "number", foreground: "E7B674" },
        { token: "type.identifier", foreground: "91C4D5" },
      ],
      colors: {
        "editor.background": "#15181e",
        "editor.foreground": "#cbd0da",
        "editorLineNumber.foreground": "#505967",
        "editorLineNumber.activeForeground": "#e5b875",
        "editor.selectionBackground": "#d4a65c26",
        "editor.lineHighlightBackground": "#ffffff03",
        "editorCursor.foreground": "#e5b875",
        "editorGutter.background": "#15181e",
        "editorWidget.background": "#20242b",
      },
    });
    monaco.editor.setTheme("mentor");
    ed.onDidChangeCursorSelection((event) => {
      if (event.source !== "mouse" && event.source !== "keyboard") return;
      const s = event.selection;
      onSelectRef.current(s.startLineNumber, s.endLineNumber);
    });
    highlight();
  };
  if (!document)
    return (
      <div className="source-empty">Choose a file to start exploring.</div>
    );
  return (
    <div className="editor-container" data-testid="source-viewer">
      <Editor
        path={document.file.path}
        language="typescript"
        value={document.content}
        theme="mentor"
        onMount={onMount}
        height="100%"
        loading={
          <div className="source-fallback">
            {document.lines.map((line, i) => (
              <button
                key={i}
                onClick={() => onSelect(i + 1, i + 1)}
                className={
                  range && i + 1 >= range.startLine && i + 1 <= range.endLine
                    ? "active"
                    : ""
                }
              >
                <span>{i + 1}</span>
                <code>{line || " "}</code>
              </button>
            ))}
          </div>
        }
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          fontSize: 12,
          fontFamily:
            '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
          lineHeight: 23,
          padding: { top: 18, bottom: 20 },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "off",
          renderLineHighlight: "line",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          contextmenu: false,
          folding: true,
          lineNumbersMinChars: 3,
          stickyScroll: { enabled: false },
          accessibilitySupport: "on",
          ariaLabel:
            "Read-only source. Select lines for questions and prediction tasks.",
        }}
      />
    </div>
  );
}
