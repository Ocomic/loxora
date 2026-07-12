# RFC-000 — Why Loxora?

**Status:** Draft  
**Version:** 0.2  
**Last Updated:** July 2026

## Why Loxora?

Software projects, books, games, research projects, and businesses all accumulate knowledge over time.

That knowledge is usually scattered across source code, documents, chats, commits, issue trackers, external tools, and individual memory. Much of it disappears or becomes difficult to retrieve whenever people, tools, or AI models change.

AI assistants can generate code, answer questions, and automate tasks, but they do not truly remember the project they are working on. Every conversation starts with limited context. Every tool retains different information. Documentation becomes outdated. Decisions lose their rationale. Projects repeatedly reconstruct knowledge they already had.

Loxora exists to solve this problem.

## Vision

Loxora provides projects with a persistent, structured, evolving, and trustworthy knowledge layer.

Knowledge belongs to the project—not to a person, chat, IDE, or AI model.

Humans and AI agents collaborate around that shared understanding.

## Living knowledge

Project knowledge is not static.

It evolves as projects evolve. Requirements change, implementations are replaced, decisions are reversed, and previously abandoned approaches may be restored.

Loxora must preserve:

- the current accepted understanding,
- previous historical understanding,
- the reasons knowledge changed,
- the evidence and decisions behind those changes,
- rollbacks and restorations without erasing history.

Current and historical knowledge must remain clearly separated so that neither humans nor agents accidentally use outdated information as if it were current.

## The problem

Project knowledge is fragmented across:

- source code,
- documentation,
- chat history,
- issue trackers,
- design documents,
- personal notes,
- AI conversations,
- external services,
- and undocumented human knowledge.

None of these sources alone represents the complete understanding of a project.

As projects evolve:

- teams answer the same questions repeatedly,
- architecture decisions become difficult to trace,
- outdated knowledge remains mixed with current knowledge,
- context is lost when conversations end,
- rollbacks remove code but often leave misleading documentation,
- lessons are rediscovered instead of reused.

## Our belief

Projects should have memory.

Not temporary context.  
Not isolated documentation.  
Not model-specific memory.

A real project memory that grows with the project, survives changing tools and contributors, and can explain both what is true now and how the project arrived there.

## Guiding principles

### Project-owned knowledge

Knowledge belongs to the project, not to any specific AI model, IDE, or contributor.

### Living and versioned knowledge

Knowledge changes through explicit revisions and state transitions. Historical understanding is preserved but must never be confused with current knowledge.

### Local first

Projects should remain in control of their own knowledge. Cloud services may extend Loxora but should never be mandatory.

### Model independence

Loxora should work with Codex, Claude Code, ChatGPT, Gemini, local models, and future systems.

### Evidence over assumptions

Information should preserve evidence, provenance, confidence, review state, and validity where possible.

### Review before canon

AI agents may propose knowledge. Shared project knowledge becomes canonical only through appropriate review policies.

### Reuse over repetition

Projects should reuse lessons, patterns, and decisions where appropriate while preserving attribution, permissions, and context.

## Scope

Loxora is not limited to software development. Its long-term scope includes:

- software repositories,
- games,
- books and novels,
- research projects,
- design systems,
- documentation collections,
- business projects,
- and future project types.

Different project types may use different profiles while sharing the same knowledge principles.

## Long-term goal

Loxora aims to become the persistent knowledge and context layer for projects.

It should help humans and AI agents:

- understand projects faster,
- preserve decisions and their history,
- distinguish current from outdated knowledge,
- generate reliable task-specific context,
- analyze dependencies within and across projects,
- and reuse knowledge safely across tools, teams, and time.

Loxora does not replace source code, documentation, or AI models. It connects them into a coherent, evolving project memory.

## Motto

**Projects should never lose their memory.**
