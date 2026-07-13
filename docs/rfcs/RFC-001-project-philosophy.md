# RFC-001 — Project Philosophy

**Status:** Draft  
**Version:** 0.3  
**Last Updated:** July 2026

## Purpose

This document defines the philosophy behind Loxora. It describes the principles that should guide architecture, features, and contributions.

When technical decisions conflict with these principles, the principles take precedence unless explicitly revised through a future RFC.

## Philosophy

> Projects should never lose their memory.

Project knowledge should not disappear when conversations end, developers change, implementations are rolled back, documentation becomes outdated, or AI models are replaced.

Knowledge should become a durable and evolving asset of the project itself.

## Core principles

### 1. Documentation before implementation

Significant features should first exist as documented understanding before they exist as source code.

### 2. Plan before architecture

Understand the problem and constraints before choosing system structure or technology.

### 3. Architecture before code

Major architectural decisions should be discussed and documented before implementation whenever reasonably possible.

### 4. Knowledge before context

Loxora stores knowledge. Context is generated temporarily from that knowledge for a specific task.

### 5. Projects own knowledge

Knowledge belongs to the project, not to an individual person, tool, IDE, or model.

### 6. AI assists—it does not govern

AI systems may identify, summarize, and propose. They must not silently redefine shared project knowledge.

### 7. Humans remain accountable

Responsibility, ownership, and engineering judgment remain with people and their explicit governance policies.

### 8. Evidence over assumptions

Important knowledge should preserve evidence, provenance, confidence, and review state.

### 9. Uncertainty is information

Unknowns, ambiguity, and conflicting evidence should be visible rather than replaced by fabricated certainty.

### 10. Local first

Loxora should function without mandatory cloud services.

### 11. Model independence

Project knowledge should outlive any individual provider, model, framework, or interface.

### 12. Small knowledge units

Knowledge should be represented as small, understandable, linkable, reviewable, and reusable units when practical.

### 13. Explicit relationships

Relationships between concepts, sources, decisions, people, agents, and projects are first-class knowledge.

### 14. Reuse before reinvention

Lessons and patterns should be reusable where appropriate, with attribution, context, and access boundaries preserved.

### 15. Progressive understanding

Loxora's understanding of a project grows over time and should never be presented as permanently complete.

### 16. Multiple perspectives

Different contributors and agents may hold legitimate perspectives. Loxora should preserve them until they are reconciled rather than silently overwriting them.

### 17. Review before canon

Shared knowledge should pass through appropriate review before becoming canonical.

### 18. Trace everything

Meaningful knowledge should explain where it came from, who proposed it, who reviewed it, why it is trusted, and when it was last verified.

### 19. Knowledge evolves

Knowledge is not merely stored. It changes through explicit, traceable revisions as the project changes.

### 20. Preserve understanding

Knowledge should normally be superseded, deprecated, archived, or historically retained rather than physically deleted.

Deletion may still be required for privacy, security, legal compliance, data minimization, or explicit retention policies.

### 21. Current before historical

Default context and answers must prioritize current canonical knowledge.

Historical knowledge should be included only when relevant and must be labeled clearly as historical, deprecated, superseded, rejected, or restored.

### 22. Rollbacks preserve history

A rollback does not erase the reverted implementation or its knowledge.

It creates a new project state, records the reason for restoration, and preserves both the reverted and restored histories.

### 23. Immutable revisions

Accepted knowledge revisions should not be silently mutated. Changes should produce new revisions linked to their predecessors.

### 24. Code defines behavior; Loxora preserves understanding

Source code remains authoritative for what software currently executes.

Loxora is authoritative for documented project understanding, rationale, relationships, and knowledge history—subject to evidence and review state.

### 25. Navigate before loading

Agents should begin with maps, indexes, and summaries before loading detailed knowledge.

A project memory should provide orientation before depth.

### 26. Progressive disclosure

Knowledge should be available in increasing levels of detail, from workspace and project maps to spaces, collections, nodes, revisions, and evidence.

The system should open only the depth required for the task.

### 27. Summaries are derived knowledge

Summaries, indexes, and maps must preserve provenance, scope, freshness, and links to their underlying knowledge.

They support navigation but never replace canonical source knowledge.

### 28. Plans are not facts

Past, current, and planned states must remain distinguishable.

A proposed or approved future state must not be presented as already implemented or canonical.

### 29. Shared does not mean unrestricted

Loxora is shared project intelligence for humans and agents, but all sharing must respect workspace boundaries, permissions, provenance, governance, and project ownership.

### 30. No knowledge mazes

Important knowledge must be reachable through clear maps, indexes, typed relationships, or search.

Orphans, broken links, stale summaries, duplicate concepts, and missing cross-project relationships should be detectable and reviewable.

## Engineering mindset

Loxora should favor:

- clarity over cleverness,
- simplicity over unnecessary complexity,
- understanding over blind automation,
- transparency over hidden behavior,
- evolution over rigid design,
- collaboration over isolation,
- explicit state over ambiguous recency,
- orientation over indiscriminate loading,
- meaningful structure over decorative graphs.

## Closing statement

Technology changes.  
Programming languages change.  
AI models change.  
Development tools change.  
Projects remain.

Loxora exists to ensure that their knowledge remains with them—and remains understandable, navigable, and trustworthy as it evolves.