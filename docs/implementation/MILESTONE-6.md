# Milestone 6: Final Hackathon Demo Experience

**Status:** Implemented and merged into `main` — Hackathon demo-ready
**Decision Owner:** Ocomic
**Authorization date:** July 15, 2026
**Scope:** Hackathon MVP Milestone 6 only

Milestone 6 adds the final local inspector and demo controller. The `@loxora/demo` package composes the existing asynchronous Core services, SQLite adapters, read-only MCP adapter, a loopback Node HTTP server, and a React/Vite client. It does not redefine lifecycle, navigation, impact, Context Package, or MCP selection rules.

The real flow is Prepared → reviewed V1 provider/consumer → reviewed `DependsOn` → breaking V2 → High exact impact → Rollback Event → reviewed V3 restoration → separate Deferred Planned Knowledge → Current Context Package → real `loxora_get_context` parity.

## Added capability

- versioned inspectable fixture bundle with stable literal UUIDs;
- migration `005_planned_knowledge` and append-only explicit non-canonical plans;
- Review Inbox for submitted Knowledge and Relationship Proposals;
- safe candidate-database reset and real staged orchestration;
- Project Map, lifecycle, impact, plan, context, and proof views;
- same-origin loopback API with validation and sanitized failures;
- real stdio MCP parity command and one critical Playwright flow.

Current and History remain unchanged. Planned items never become canonical, never enter Current, and are excluded from the Milestone 6 MCP proof. Source locators are references only and are not dereferenced by the application.

## Persistence and boundaries

Migration 005 adds `planned_knowledge_items`, project-qualified Node/Evidence joins, ownership constraints, indexes, and append-only triggers. Planned creation writes one normalized Evidence-backed Audit Event. Project Map Planned counts and navigation fingerprints are derived; stale/missing projections continue to fall back to canon.

`@loxora/demo` may know fixture aliases and stage recipes. Browser code cannot import Core, SQLite, MCP, server modules, or Node APIs. HTTP handlers contain no SQL. The server binds only to `127.0.0.1:4173`.

## Known limitations

This is a local inspector, not a production application. There is no authentication, production permission engine, multi-user coordination, sync, search, importer, external Source fetching, or deployment. Planned status transitions and review governance are deferred. Context Packages remain ephemeral. Deterministic export is still an explicit portability gap, so Milestone 6 establishes demo readiness rather than permanent MVP completeness.
