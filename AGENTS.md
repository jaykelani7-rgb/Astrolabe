<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Astrolabe project context

- Use `plan.md`, `README.md` and observed implementation/checks to assess progress.
  The separate Contract.MD is not this project's execution baseline.
- Optional local skills are under `.codex/skills/skills/`, with ignored discovery
  links under `.agents/skills/`. Read the relevant SKILL.md only when it helps the
  current request. Preserve their licenses and keep these local files out of Git.
- Some skill references describe Claude or optional external tooling. Use available
  Codex tools and existing authorization; do not install tools, spawn agents or
  change the application merely because a skill mentions doing so.
