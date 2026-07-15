# Hackathon Demo Runbook

## Setup

```powershell
npm install
npx playwright install chromium
npm run demo:reset
npm run demo:start
```

Open `http://127.0.0.1:4173`. Reset uses `<repo>/var/demo`; no prepared database is committed.

## Live sequence

1. On Home confirm `Prepared`, migration `005_planned_knowledge`, and two fresh Project Maps.
2. In Review Inbox accept both Initial V1 Proposals as `Ocomic`.
3. Accept the newly prepared `DependsOn` Proposal.
4. Open both Project Maps and inspect outgoing/incoming dependency summaries.
5. Accept the V2 Successor replacing `customer_id` with `subject_id`.
6. On Impact create the V2 Assessment; expect `High`, Relationship `Stale`, Assessment `Fresh`.
7. Inspect the 401 Evidence through the Project navigation.
8. Record the real Rollback Event.
9. In Review Inbox accept the V3 Restoration Proposal.
10. Open Token Format: Current shows V3 only; History shows V1 → V2 → V3; Planned shows the separate Deferred migration.
11. Build the customer-portal Current Context Package at depth one. Expect Token Parser Current plus provider V3 and no V1/V2 Current instructions.
12. Run `npm run demo:mcp:proof`, refresh MCP proof, and expect identical normalized output and stage `Complete`.

## Recovery

- `npm run demo:reset -- --stage Prepared` resets safely through a candidate database.
- CLI also accepts `V1Accepted`, `DependencyAccepted`, `V2Accepted`, `ImpactAssessed`, `RollbackRecorded`, and `V3Restored` for rehearsal.
- Use Resume after an accepted transition when preparation of the next artifact was interrupted.
- A reset failure retains the previous database. Stop external MCP readers if Windows reports a busy database, then retry.
- A rejected Proposal intentionally diverges the script; reset to Prepared.

## Rehearsal checklist

```powershell
npm run demo:reset
npm run demo:verify
npm run test:demo:e2e
npm run demo:mcp:proof
```

Confirm breadcrumbs, distinct teal/slate/violet temporal views, both dependency directions, High V2 impact, Deferred plan, Context budget/warnings, and real MCP parity.
