# Hackathon Demo Runbook

## Setup

Use Node 24.18 or later:

```powershell
npm run demo:reset
npm run demo:start
```

Open `http://127.0.0.1:4173/?mode=guided`. Reset uses `<repo>/var/demo`; no prepared database is committed.

## Guided Demo

The server derives progress from real state. The browser never enables a canonical operation on its own.

| Step | Primary action | Visible result |
|---|---|---|
| 1. Establish project knowledge | Accept both V1 Proposals | Two traceable Current V1 revisions |
| 2. Connect the projects | Accept `DependsOn` | Dependency visible from both Project Maps |
| 3. Introduce a breaking change | Accept V2 | Current V1→V2; V1 Historical; binding Stale |
| 4. Assess cross-project impact | Create Assessment | High impact, Relationship Stale, Assessment Fresh |
| 5. Record rollback | Record Rollback Event | V2 preserved; V1 not reactivated |
| 6. Restore compatible knowledge | Accept V3 | V3 Current; V1/V2 Historical |
| 7. Compare time | Open Node temporal views | Current, History, and Deferred Planned remain separate |
| 8. Build Context | Build prepared Current request | Human summary, V3 dependency bundle, budget result |
| 9. Verify MCP | Run proof command | Exact normalized UI/Core/MCP match |

Explore mode remains available throughout. It changes navigation only. Returning to Guided mode uses the server-derived current step.

## MCP proof

After building Context:

```powershell
npm run demo:mcp:proof
```

Open MCP Proof and refresh. Confirm matching UI and MCP fingerprints plus Match rows for ordered entries, Revisions, Evidence, dependency paths, Impact Assessments, budget, and warnings.

## Recovery

- Refresh: canonical stage and available actions are derived again.
- Missing follow-up artifact: use **Resume preparation**.
- Rejected Proposal: Current knowledge remains safe; reset to Prepared to restore the guided story.
- Stale or duplicate review: refresh the Inbox and follow the server-provided Current state.
- Reset failure: the previous database is preserved; stop external MCP readers and retry.
- MCP unavailable: the product UI remains usable and shows the exact recovery command.

## Rehearsal

```powershell
npm run demo:reset
npm run demo:verify
npm run test:demo:e2e
npm run demo:mcp:proof
```

Verify at 1920×1080, 1440×900, and 1280×720: no horizontal scrolling, visible primary action, keyboard focus, temporal text labels, one-viewport High Impact, Context summary before JSON, and understandable parity.

## Screenshot checklist

At 1440×900 with diagnostics and technical disclosures collapsed, capture Home progress, both-direction dependency, V2 review, High Impact, V1→V2→V3, temporal distinction, Context summary, and MCP parity. Capture only deterministic final states after validation.
