# Dogfooding Guide

This guide describes how to use the Loxora CLI on real projects on your own machine. It deliberately contains no project-specific or private knowledge: that knowledge belongs in your local workspace, not in this repository.

## Principles

- Knowledge stays local: the workspace lives under `<home>/.loxora/workspaces/` and never inside a repository.
- Agents propose, humans review. Configure your own id as the only reviewer, and let agents act as `agent:<name>`.
- Record provenance: every Proposal cites the repository file and commit it is based on.
- Keep current, historical, and planned knowledge separate. Roadmap items are Planned Knowledge, not Current knowledge.
- Record friction. Where the model does not fit real work, note it. That evidence drives the next decisions.

## First session

```sh
npm run loxora -- workspace init --reviewer <your-id> --name <workspace-name>
export LOXORA_ACTOR=agent:<agent-name>    # PowerShell: $env:LOXORA_ACTOR = "agent:<agent-name>"

npm run loxora -- project add --name <project> --purpose "<one sentence>"
npm run loxora -- space add --project <project> --name Decisions
npm run loxora -- collection add --project <project> --space Decisions --name <area>
npm run loxora -- source add --project <project> --title "Decision log" \
  --locator "git:<owner>/<repository>@<commit>:docs/DECISION-LOG.md"
npm run loxora -- evidence add --project <project> --source "Decision log" --summary "<decision>" --locator "#<anchor>"
npm run loxora -- propose new --project <project> --space Decisions --collection <area> \
  --title "<decision title>" --content "<decision and rationale>" --source "Decision log" --evidence <evidence-id>

npm run loxora -- inbox
npm run loxora -- review --proposal <id-prefix> --decision accept --reason "<why>" --evidence <evidence-id> --actor <your-id>
npm run loxora -- show map --project <project>
```

## Suggested mapping

| Existing artifact | Loxora concept |
|---|---|
| Decision log entries | Proposals in a `Decisions` Space, reviewed into Current knowledge |
| Changed decisions | `propose successor` with `--reason`; the earlier Revision stays in History |
| Roadmap phases | `plan add` (Planned Knowledge), linked to affected Nodes |
| Benchmark runs, test results | Sources and Evidence cited by Proposals and reviews |
| A project that consumes another project's output | `relate propose --from-project <consumer> --to-project <provider>` |
| Context for an agent task | `context --project <p> --node <n> --include-related` |

## After each session

- `npm run loxora -- export --out <backup-path>` and `export verify --in <backup-path>`.
- Write down what was awkward, missing, or wrong. Keep private details in your workspace. Generalized lessons can become RFC, ADR, or planning updates in this repository.
