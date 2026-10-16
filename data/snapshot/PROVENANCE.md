# Prepared source snapshot

- Repository: [pmndrs/zustand](https://github.com/pmndrs/zustand)
- Release: `v5.0.8`
- Immutable commit: `0ea8be27db13019819fc1c0492e5b672dd7b6f4b`
- Annotated release tag object: `e30db4d1c2cc4a58ef60dd581cff1ff22e2e3a08`
- License: MIT; the complete upstream license is retained in `LICENSE`.
- Files: all 15 TypeScript files under upstream `src/`, copied byte for byte.

The archive was retrieved from GitHub's codeload endpoint for the full commit above. `manifest.json` retains the archive digest, per-file SHA-256 hashes and byte lengths, and license digest. The application validates the allowlisted paths and file hashes before serving source or creating evidence. No analyzed repository scripts, configurations, dependency installers, or application code are executed. External dependencies appear explicitly as unresolved boundaries on the module map.

Run `npm run prepare:repository` from the application root to validate the bundled snapshot and rebuild its search index. Preparation needs no network access. The bundled source is the authoritative input; this prototype does not accept arbitrary repository URLs or local paths.
