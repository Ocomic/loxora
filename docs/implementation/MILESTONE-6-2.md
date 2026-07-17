# Milestone 6.2: Jury Flow and General-Audience Clarity

**Status:** Implemented and merged into `main` — Hackathon jury-ready
**Decision Owner:** Ocomic
**Authorization date:** July 17, 2026
**Scope:** Hackathon presentation and jury-flow clarity only

## Outcome

Milestone 6.2 closes the remaining presentation gaps in the real Guided Demo:

```text
server-authorized action
→ revalidated result
→ plain-language meaning
→ visible server-authorized next action
```

Every successful Result Receipt now presents the next real step. The browser still cannot authorize review, impact, rollback, restoration, Context, or MCP behavior.

## Explicit temporal transition

Step 7 now uses one Guided comparison surface backed by the existing Current, History, and Planned read APIs. Confirming the comparison writes only a presentation receipt containing the fixture, Project, Node, exact V1/V2/V3 IDs, and Planned item ID.

The server revalidates that V3 is Current, History is exactly V1→V2→V3, and the Deferred plan exists before exposing Step 8. Reset, fixture mismatch, missing artifacts, or different Current knowledge invalidate the receipt. No Revision, Current pointer, Plan, Relationship, Assessment, or Audit Event is changed.

## Human-first presentation

- The nine steps are grouped into Establish, Change & Recover, and Use & Prove.
- Current, Historical, Planned, relationship-binding freshness, and assessment freshness receive plain-language explanations while raw values remain inspectable.
- Context leads with the task, currently valid knowledge, affected Projects, dependency, exact Assessment, historical exclusion, and budget before technical entries and JSON.
- Reset is secondary and requires confirmation.
- Result focus and scrolling keep the verified result and next action together.
- Home includes a clearly labeled concept preview mapping the same lifecycle to novel continuity. No novel fixture or second implemented workflow is claimed.
- The browser remains a proof viewer; only `npm run demo:mcp:proof` invokes the real read-only MCP tool.

## Preserved boundaries

No Core type, persistence schema, migration, fixture, lifecycle rule, Planned behavior, relationship semantics, Context selection, fingerprint, MCP contract, dependency, authentication, import, export, search, synchronization, or deployment behavior changed.

Deterministic export remains the explicit portability gap. A real novel continuity fixture remains an optional, separately authorized Milestone 6.3.

## Validation

The required unit, boundary, lifecycle, browser, Context, and MCP parity checks are listed in the [Demo Runbook](./DEMO-RUNBOOK.md). The critical Playwright flow verifies all nine steps at 1280×720, including the explicit Step 7→8 transition, reset confirmation, and exact UI/MCP parity.
