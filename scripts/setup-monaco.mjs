import { cpSync, existsSync, mkdirSync } from "node:fs";
mkdirSync("public/monaco", { recursive: true });
cpSync("node_modules/monaco-editor/min/vs", "public/monaco/vs", {
  recursive: true,
});
for (const notice of ["LICENSE", "ThirdPartyNotices.txt"]) {
  const source = `node_modules/monaco-editor/${notice}`;
  if (existsSync(source)) cpSync(source, `public/monaco/${notice}`);
}
console.log("Local read-only source editor assets ready.");
