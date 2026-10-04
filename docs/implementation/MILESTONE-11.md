# Milestone 11: Mission Control MVP (read-only)

**Status:** Implemented — awaiting review and merge
**Decision Owner:** Ocomic
**Authorization date:** October 3, 2026
**Change class:** C2 (RFC-008)
**Implements:** RFC-010 — Product UI Shell and Mission Control MVP, sections 1 to 8

## Authorization

Ocomic accepted RFC-010 on October 3, 2026 (pull request #23). The acceptance authorizes this milestone for the read-only Mission Control MVP. RFC-010 section 9 (the configured UI actor and write actions) follows in a separate small milestone.

## Goal

Show real agent work from the local workspace in a product UI: which Missions run, which wait for a provider limit, which need a human, and what finished missions produced.

## Authorized scope

- **New package `@loxora/app`:**
  - a local server on `127.0.0.1` with a read API over Core reads;
  - a React/Vite web client following the decision owner's design drafts where data exists.
- **Read-only workspace access:** never migrates. A missing or outdated workspace answers 503 with guidance.
- **Mission Control:**
  - status filters with counts, and active and recent missions;
  - a list sorted by need for attention;
  - Mission Detail for running, provider limit, needs input or approval, completed, failed, queued, paused, and cancelled;
  - a timeline with polling.
- Core helpers shared by the CLI and the app: `compareMissionsByAttention`, `missionAttentionRank`, `missionNeedsHuman`.
- Tests, documentation, and a manual browser check.

## Explicit non-scope

- Write actions and the configured actor (RFC-010 section 9, next milestone). `--actor` is refused with a pointer to that milestone.
- Station, Crew, Chat, Memory, and Settings, and the "New Mission" and "Context Review" flows.
- Elements without a data source in the design drafts: steps and checklist, crew panel, agent chat, costs and limit percentage, the automatic-continuation toggle, and action buttons.
- Artwork from the design drafts (license open), push updates, and English labels.

## Design notes

- **Per-request read-only connections.** The server opens the workspace read-only for every API request, with `requiredMigrationId: 007_missions` and no migrations, then closes it. CLI writes and migrations therefore appear without restarting the UI.
- **Leaked handle fixed.** A required-migration check on a database without `schema_migrations` used to throw before closing its connection. On Windows that left the file locked. The adapter now closes the connection first.
- **API shape.** Responses are view models built only from Core reads (`MissionService`, the workspace export for labels). `availableActions` is always empty in the MVP. Writes answer 405.
- **Browser boundary.** The web client defines its own response types and may not import Core, SQLite, CLI, MCP, Node, or server code (boundary test).
- **Labels.** All UI text is German and lives in `labels.ts`. Raw codes such as `needs_input` appear only under "Technical details".
- **Responsive layout.** Two columns on desktop. On narrow screens the opened Mission comes before the sidebar, and the header wraps.
- **Shutdown.** `close()` also closes keep-alive connections so that tests and restarts do not hang.

## Acceptance checks

| Check | Evidence |
|---|---|
| The read API lists Missions by attention with counts per filter; unknown filters are rejected | `packages/app/test/app.test.ts` |
| Mission detail and events come from Core; unknown Missions answer 404; writes answer 405 | `packages/app/test/app.test.ts` |
| The UI never migrates: a missing or outdated workspace answers 503, and an empty database stays empty | `packages/app/test/app.test.ts` |
| The web client is served with a single-page fallback and without path traversal | `packages/app/test/app.test.ts` |
| Browser source imports no Core, SQLite, CLI, MCP, Node, or server code | `packages/app/test/app.test.ts` |
| Existing behavior is unchanged; the CLI uses the shared attention order | `npm run check` (92 tests) |
| Manual browser check on a copy of the dogfooding workspace with real and sample Missions: list, filters, all detail states, mobile layout, polling after CLI changes, no console errors | Recorded in the pull request |

## Knowledge, navigation, and documentation effects

- New: `docs/implementation/APP.md` and this document.
- Updated: RFC-010 (accepted), RFC index, `CROSS-REFERENCES.md`, `UI-VISION.md`, `WEB-UI.md`, `open-questions.md`, the planning index, and `AGENTS.md`.
