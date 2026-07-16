# Milestone 6.1: Guided Demo UX and Visual Polish

**Status:** Implemented locally on `agent/milestone-6-1-guided-demo-ux`
**Decision Owner:** Ocomic
**Authorization date:** July 16, 2026
**Scope:** Hackathon Milestone 6.1 presentation and UX only

## Outcome

Milestone 6.1 makes the real Milestone 6 flow understandable without reading the Runbook first:

```text
Guided Demo
→ one server-authorized next action
→ real canonical transition
→ revalidated result explanation
→ Explore the underlying Project, Evidence, History, Impact, and Context
```

The browser presents nine guided steps while canonical eligibility remains server- and Core-owned. Guided mode, URL hints, local presentation preference, and Result Receipts cannot authorize lifecycle, review, impact, rollback, restoration, Context Package, or MCP behavior.

## Presentation boundary

- `GuidedDemoState` is derived from canonical stage, Current pointers, Review Inbox state, impact records, Context request existence, and parity proof metadata.
- Structured actions are returned by the server. React invokes only actions present in that response.
- Result Receipts are operational presentation metadata. Fixture, stage, artifacts, and Current agreement are revalidated before display.
- Invalid or reset receipts disappear; History and Impact remain the durable domain record.
- Explore mode changes navigation only and never canonical state.
- The prepared Context request comes from fixture-aware server orchestration; generic browser components contain no fixture IDs or Project-name branches.
- The browser remains an MCP proof viewer. `npm run demo:mcp:proof` still launches the real read-only stdio tool.

## Guided steps

1. Establish both V1 Current revisions.
2. Accept the reviewed `DependsOn`.
3. Accept breaking V2.
4. Create the exact High V2 Assessment.
5. Record the Rollback Event.
6. Accept the V3 restoration.
7. Compare Current, History, and Planned.
8. Build the Current Context Package.
9. Verify real MCP parity.

## Visual and accessibility work

The local UI now uses semantic tokens for Current, Historical, Planned, Warning, High Impact, Error, Evidence, and Success. Human labels lead; identifiers and normalized JSON remain in technical disclosures. Keyboard-visible focus, a skip link, semantic controls, reduced-motion behavior, responsive guidance, linked breadcrumbs, and text-plus-color state labels support reliable presentation at 1920×1080, 1440×900, and 1280×720.

The header uses a compact circuit-elephant brand mark and the cyan, blue, violet, and near-black palette of the Loxora identity. Result Receipts are block-level presentation surfaces so successful review feedback cannot fragment the page layout. Follow-up fixture preparation is isolated from the accepted canonical transition: if preparation fails after acceptance, canon remains accepted and the Guided UI offers safe Resume recovery instead of misreporting the review as failed.

## Preserved behavior

No migration, schema, Core interface, lifecycle rule, Planned Knowledge behavior, relationship type, Assessment rule, Context selection rule, fingerprint, MCP tool, permission system, import/export, search, or external Source retrieval was added. Source and Evidence screens expose existing read APIs and never dereference locators.

## Submission screenshots

Validated screenshots were generated at 1440×900 after the full Guided E2E path passed:

1. [Home and Guided progress](./screenshots/milestone-6-1/01-home-guided-progress.png).
2. [Project Map dependency](./screenshots/milestone-6-1/02-project-map-dependency.png).
3. [Breaking V2 review](./screenshots/milestone-6-1/03-v2-review.png).
4. [High Impact path](./screenshots/milestone-6-1/04-high-impact-path.png).
5. [V1→V2→V3 timeline](./screenshots/milestone-6-1/05-v1-v2-v3-timeline.png).
6. [Current/History/Planned distinction](./screenshots/milestone-6-1/06-temporal-distinction.png).
7. [Context Package summary](./screenshots/milestone-6-1/07-context-package-summary.png).
8. [Exact UI/MCP parity](./screenshots/milestone-6-1/08-ui-mcp-parity.png).

## Remaining limitations

This is a bounded local Hackathon presentation, not a production application. Deterministic export remains the explicit portability gap. Authentication, production permissions, synchronization, search, generalized import, graph visualization, persistent Context Packages, and deployment remain deferred.
