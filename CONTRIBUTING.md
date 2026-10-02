# Contributing to Loxora

Thank you for your interest in Loxora. This guide explains how changes are proposed, reviewed, and accepted.

## Before you start

Loxora is documentation-driven. Read [`AGENTS.md`](AGENTS.md) and [`docs/rfcs/RFC-004-development-workflow.md`](docs/rfcs/RFC-004-development-workflow.md) before proposing significant work.

- Small fixes (typos, broken links, tests, tooling) can go straight to a pull request.
- Significant changes (architecture, schema, public contracts such as HTTP, MCP, or export formats, new packages, or new external integrations) need an accepted RFC or ADR before implementation. Open an issue or a documentation pull request first.

## License of contributions

Loxora is licensed under the [Apache License, Version 2.0](LICENSE). Under Section 5 of that license, any contribution you intentionally submit for inclusion is licensed under the same terms ("inbound = outbound"). No separate Contributor License Agreement is required.

## Developer Certificate of Origin (DCO)

Every commit must be signed off under the [Developer Certificate of Origin 1.1](DCO). The sign-off certifies that you wrote the change or otherwise have the right to submit it under the project license.

Add the sign-off with:

```sh
git commit -s
```

This appends a line such as:

```text
Signed-off-by: Your Name <you@example.com>
```

The name and email must match the commit author. Anonymous contributions cannot be accepted.

If you forgot to sign off on commits in your own pull request branch, amend them with `git commit --amend -s` or `git rebase --signoff <base>` and force-push your branch.

### AI-assisted and agent-authored commits

AI agents may draft changes, but a human remains accountable for every contribution. An AI agent cannot certify the DCO.

- Commits created by an AI agent are authored under the agent's own identity (for example `Claude <noreply@anthropic.com>`) so that agent involvement stays visible in history.
- Agent-authored commits do not carry a `Signed-off-by` line from the agent, and an agent must never add a sign-off in a human's name.
- The maintainer who authorized the agent session and merges the pull request takes DCO responsibility for those commits by reviewing and merging them.
- Agent identities exempted from the automated sign-off check are listed in `.github/dco-agent-identities`. Changes to that list require maintainer review.
- When a human edits or co-develops a change, the human's own commits must be signed off as usual.

## Pull requests

- Keep changes small, explicit, and reviewable.
- Run `npm run check` locally (format, lint, typecheck, tests, build) and make sure it passes.
- Fill in the pull request template: what changed, what was intentionally not changed, assumptions, validation, open questions, and knowledge or navigation effects.
- Do not mix unrelated changes in one pull request.

## Public and private knowledge

Open-source code does not mean all project knowledge is public. Before adding product, business, security, infrastructure, roadmap, or project-specific decisions to this repository, check that the information is safe and intended for public disclosure.

Never commit credentials, secrets, private customer data, or security-sensitive operational details.

## Trademark

The Apache License does not grant rights to the Loxora name or logo. A trademark policy is pending.
