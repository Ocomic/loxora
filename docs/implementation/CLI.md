# Loxora CLI

Milestone 8 implements ADR-004. Milestone 9 implements ADR-006, which adds plan revisions, Node keys, and ergonomics (CLI contract version 2). `loxora` is a thin local command-line adapter over the Core services. Humans and agents use it to propose knowledge; workspace reviewers decide what becomes Current.

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
- **Migrations:** opening a workspace applies pending migrations, for example `006_plan_revisions_node_keys` (Milestone 9). Export a backup first.
- **Backups:**
  - `loxora export --out <file>` and `loxora export verify --in <file>` (format version 2).
  - Older version 1 backups are upgraded on read. `export verify` reports "identical after upgrade" and names the migrations the restored store adds.

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

## Output and exit codes

- Human-readable text by default. `--json` prints the result data, or `{ "error": { "kind", "message" } }` on failure. Version 2 only adds JSON fields.
- Exit code `0` means success, `2` means a usage, validation, or governance error, and `1` means an unexpected error.

## Provenance convention

- **Sources from repositories:** `git:<owner>/<repository>@<commit>:<path>`.
- **Evidence locators:** point inside the Source, for example `#D-003` or `L10-L24`.
- This is a convention, not a validated schema (ADR-004).
