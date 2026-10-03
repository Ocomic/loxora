# Loxora CLI

Milestone 8 implements ADR-004. Milestone 9 implements ADR-006, which adds plan revisions, Node keys, and ergonomics (CLI contract version 2). Milestone 10 implements ADR-005, which adds the `mission` commands (CLI contract version 3). `loxora` is a thin local command-line adapter over the Core services. Humans and agents use it to propose knowledge; workspace reviewers decide what becomes Current.

## Running it

```sh
npm ci && npm run build
npm run loxora -- --help                 # from the repository root
node packages/cli/dist/src/main.js --help  # equivalent
npm run loxora -- plan update --help     # usage of one command; also: loxora help plan update
```

The CLI needs Node.js as pinned in `.nvmrc`. It works on Windows, macOS, and Linux.

## Workspace

- **Location**, in resolution order:
  1. `--workspace <dir>`;
  2. the `LOXORA_WORKSPACE` environment variable;
  3. `<home>/.loxora/workspaces/default`. Tests may set `LOXORA_HOME` to replace `<home>`.
- **Contents:**
  - `workspace.sqlite`, the store;
  - `workspace.json`, which holds `configVersion`, `name`, and `reviewers`.
- **Initialization:** `loxora workspace init --reviewer <id> [--name <name>]`.
  - At least one reviewer is required, and `agent:*` ids are rejected as reviewers.
  - Initialization inside a Git working tree is refused unless `--allow-in-repository` is given.
- **Migrations:** opening a workspace applies pending migrations, for example `006_plan_revisions_node_keys` (Milestone 9) or `007_missions` (Milestone 10). Every command opens the workspace, including `export`, so back up by copying the workspace directory before upgrading.
- **Backups:**
  - `loxora export --out <file>` and `loxora export verify --in <file>` (format version 3).
  - Older version 1 and 2 backups are upgraded on read. `export verify` reports "identical after upgrade" and names the migrations the restored store adds.

## Actors and review

- Every write command needs `--actor <id>` or the `LOXORA_ACTOR` environment variable.
- Agents should use `agent:<name>`, for example `agent:claude-code` or `agent:codex`.
- **Reviewers only, never `agent:*`:**
  - `review` and `relate review`;
  - closing (`Completed`, `Cancelled`) or reopening a plan;
  - assigning a key to an existing Node.
- Other actors who close or reopen a plan create a plan revision proposal for a reviewer.
- If `review` or `relate review` has no `--evidence`, the Evidence cited by the proposal is used, and the output says so.
- This guards against accidental self-acceptance. It is not authentication: anyone with file access can change the workspace.

## References

- **Nodes:** exact id, key (for example `D-001`, case-insensitive), unique title, or a unique id prefix of at least 6 characters.
- **Projects, spaces, collections, and sources:** id, unique name or title, or id prefix.
- **Plans:** id, unique effective title, or id prefix; `--project` narrows the search.
- **Proposals** (knowledge or plan revision) and **Evidence:** id or prefix.
- **Missions:** id, unique title, or id prefix.
- An ambiguous reference fails and asks for the full id. Referencing a Node that only has a pending Proposal points to that Proposal.

## Commands

| Command | Purpose |
|---|---|
| `workspace init`, `workspace status` | Create a workspace. Status counts Nodes with accepted knowledge, pending Nodes, pending proposals, and plans by status. |
| `project add --name [--purpose]` | Create a Project |
| `space add --project --name [--description]` | Create a Knowledge Space |
| `collection add --project --space --name [--description]` | Create a Knowledge Collection |
| `source add --project --locator --title [--kind]` | Register a Source (see provenance below) |
| `evidence add --project --source --summary --locator` | Register Evidence inside a Source |
| `propose new --project --space --collection --title (--content \| --content-file) --source… --evidence… [--key]` | Propose a new Node, optionally with an immutable key |
| `propose successor --project --node (--content \| --content-file) --reason --source… --evidence…` | Propose a new Revision of a Node's Current knowledge |
| `node key --project --node --key` | Give an existing Node an immutable key, once (reviewers only) |
| `inbox [--project]` | List items awaiting review. Knowledge proposals show Project and key; relationships show both endpoints, confidence, and author; plan revision proposals show plan, status change, changed fields, and author. |
| `review --proposal --decision accept\|reject --reason [--evidence…]` | Review a knowledge Proposal or a plan revision proposal (reviewers only) |
| `plan add --project --title --description --status --reason --blocking-condition [--node…] [--related-project --related-node…] [--evidence…]` | Record Planned Knowledge (never Current); revision 1 |
| `plan update --plan [--project] --reason [--status] [--title] [--description] [--blocking-condition] [--add-node…] [--remove-node…] [--related-project <p>\|none] [--evidence…] [--remove-evidence…]` | New plan revision, or a plan revision proposal when closing or reopening without reviewer rights |
| `plan history --plan [--project]` | Plan revisions and proposals; the effective revision is marked |
| `mission create --project --title --goal [--ref-project…] [--node…] [--plan…] [--role] [--predecessor]` | Record a Mission (state `queued`); references must exist |
| `mission start --mission [--activity]`, `mission activity --mission --text` | Start; report what is happening now |
| `mission wait --mission --reason <wait reason> [--detail] [--capability] [--expected-resume] [--question --why [--option [--consequence]]…]` | Wait for a provider limit or for a human (Attention Request) |
| `mission answer --mission --response [--decision approve\|reject] [--evidence…]` | Answer the Attention Request (humans only) |
| `mission resume --mission`, `mission pause --mission [--reason]`, `mission cancel --mission --reason` | Resume after an answer or a provider limit; pause and cancel are human-only |
| `mission complete --mission --summary [--output…] [--validation…] [--decision…] [--proposal…] [--log…] [--evidence…]`, `mission fail --mission --reason […]` | Record the Outcome; external log references are flagged not portable |
| `mission show --mission`, `mission list [--project] [--state] [--reason] [--attention]` | Mission Detail; list sorted by need for attention |
| `relate propose --from-project --from-node --to-project --to-node --evidence… --reason [--confidence] [--restricted]` | Propose a `DependsOn` relationship from consumer to provider |
| `relate review --proposal --decision --reason [--evidence…]` | Review a relationship (reviewers only) |
| `show map --project` | Project tree with keys, Current markers, pending Nodes, and plans. `--json` returns the Project Map plus plans. |
| `show current --project --node` | Current Revision and content |
| `show history --project --node` | All accepted Revisions, with Current and historical entries labeled |
| `show plans --project` | Effective plans: status, revision number, and "closed" or "not yet done"; never canonical knowledge |
| `context --project --node… [--history] [--include-related] [--budget] [--task]` | Deterministic Context Package (JSON) |
| `export --out`, `export verify --in` | Workspace export and round-trip check |

Every write command rebuilds the navigation projection of the affected Projects.

## Plans

- `plan update` links only Nodes with accepted knowledge. Link them after review through a new revision.
- `--add-node` resolves in the owning Project first, then in the related Project.
- Plan status never follows Missions automatically. A Mission can be completed while its plan stays `InProgress`.

## Missions

- Missions are execution state, never knowledge (RFC-009). They do not change maps, Context Packages, or knowledge Audit Events. Results become knowledge only through `propose` and `review`; list them with `mission complete --proposal`.
- **Wait Reasons:** `provider_limit` (a controlled pause, not a failure; nothing resumes automatically), `needs_input`, `needs_approval`, `needs_permission`, `needs_manual_action`. `needs_budget` is reserved.
- **Humans only:** answering, pausing, cancelling, and resuming a paused Mission. Agents may resume after a provider limit, or after a human answered.
- **Continuing finished work:** create a new Mission with `--predecessor`; terminal states are final.
- **Logs:** never stored. Use `--log workspace:<path>` for files inside the workspace directory; `external:<locator>` is kept but flagged not portable.

## Output and exit codes

- Human-readable text by default. `--json` prints the result data, or `{ "error": { "kind", "message" } }` on failure. Version 2 only adds JSON fields.
- Exit code `0` means success, `2` means a usage, validation, or governance error, and `1` means an unexpected error.

## Provenance convention

- **Sources from repositories:** `git:<owner>/<repository>@<commit>:<path>`.
- **Evidence locators:** point inside the Source, for example `#D-003` or `L10-L24`.
- This is a convention, not a validated schema (ADR-004).
