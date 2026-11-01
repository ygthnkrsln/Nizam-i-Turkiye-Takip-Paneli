# Project instructions

Before exploring this repository, read [PROJECT_MAP.md](./PROJECT_MAP.md). Use its feature-to-file map to inspect only the relevant implementation and its direct dependencies; do not start with a repository-wide scan.

Treat source code as authoritative when it differs from the map. Update the map when a change moves responsibilities, adds/removes an API route, or materially changes a documented data flow. Do not update it for routine UI, copy, or isolated bug-fix changes.

For code changes, run the narrowest applicable check. Available project checks are `npm run lint` and `npm run build`.
