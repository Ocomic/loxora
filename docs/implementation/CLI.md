# Loxora CLI

Milestone 8 implements ADR-004. `loxora` is a thin local command-line adapter over the Core services. Humans and agents use it to propose knowledge; workspace reviewers decide what becomes Current.

## Running it

```sh
npm ci && npm run build
npm run loxora -- --help                 # from the repository root
node packages/cli/dist/src/main.js --help  # equivalent
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
- **Backups:** `loxora export --out <file>` and `loxora export verify --in <file>` (Milestone 7 format).

## Actors and review

- Every write command needs `--actor <id>` or the `LOXORA_ACTOR` environment variable.
- Agents should use `agent:<name>`, for example `agent:claude-code` or `agent:codex`.
- `review` and `relate review` are only allowed for actors listed in `reviewers`, and never for `agent:*`.
- This guards against accidental self-acceptance. It is not authentication: anyone with file access can change the workspace.

## References

Projects, spaces, collections, nodes, and sources can be referenced by exact id, by unique name or title, or by a unique id prefix of at least 6 characters. Proposals and evidence are referenced by id or prefix. An ambiguous reference fails and asks for the full id.

## Commands

| Command | Purpose |
|---|---|
| `workspace init`, `workspace status` | Create a workspace; summarize Projects and pending Proposals |
| `project add --name [--purpose]` | Create a Project |
| `space add --project --name [--description]` | Create a Knowledge Space |
| `collection add --project --space --name [--description]` | Create a Knowledge Collection |
| `source add --project --locator --title [--kind]` | Register a Source (see provenance below) |
| `evidence add --project --source --summary --locator` | Register Evidence inside a Source |
| `propose new --project --space --collection --title (--content \| --content-file) --source… --evidence…` | Propose a new Node |
| `propose successor --project --node (--content \| --content-file) --reason --source… --evidence…` | Propose a new Revision of a Node's Current knowledge |
| `inbox [--project]` | List Proposals awaiting review |
| `review --proposal --decision accept\|reject --reason --evidence…` | Review a Proposal (reviewers only) |
| `plan add --project --title --description --status --reason --blocking-condition [--node…] [--related-project --related-node…] [--evidence…]` | Record Planned Knowledge (never Current) |
| `relate propose --from-project --from-node --to-project --to-node --evidence… --reason [--confidence] [--restricted]` | Propose a `DependsOn` relationship from consumer to provider |
| `relate review --proposal --decision --reason --evidence…` | Review a relationship (reviewers only) |
| `show map --project` | Project tree with Current markers; `--json` returns the Project Map |
| `show current --project --node` | Current Revision and content |
| `show history --project --node` | All accepted Revisions, with Current and historical entries labeled |
| `show plans --project` | Planned Knowledge, labeled not implemented and not canonical |
| `context --project --node… [--history] [--include-related] [--budget] [--task]` | Deterministic Context Package (JSON) |
| `export --out`, `export verify --in` | Workspace export and round-trip check |

Every write command rebuilds the navigation projection of the affected Projects.

## Output and exit codes

- Human-readable text by default. `--json` prints the result data, or `{ "error": { "kind", "message" } }` on failure.
- Exit code `0` means success, `2` means a usage, validation, or governance error, and `1` means an unexpected error.

## Provenance convention

- **Sources from repositories:** `git:<owner>/<repository>@<commit>:<path>`.
- **Evidence locators:** point inside the Source, for example `#D-003` or `L10-L24`.
- This is a convention, not a validated schema (ADR-004).
