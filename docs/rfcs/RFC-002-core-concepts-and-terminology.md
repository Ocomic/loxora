# RFC-002 — Core Concepts & Terminology

**Status:** Draft  
**Version:** 0.2  
**Last Updated:** July 2026

## Purpose

This document defines the canonical terminology used throughout Loxora.

Every important concept should have one official definition. Avoid synonyms where practical.

## Terminology principles

### One concept, one definition

Do not use different terms for the same core concept and do not overload terms with multiple meanings.

### Domain independence

Concepts should work for software, books, games, research, business, and future project types.

### Current and historical clarity

Terminology must clearly distinguish current knowledge from previous, deprecated, superseded, rejected, or restored knowledge.

## Core concepts

### Workspace

A logical environment containing one or more projects and defining boundaries for membership, visibility, governance, and permitted knowledge sharing.

Examples include Personal, Team, and Organization Workspaces.

### Project

The primary long-term unit of knowledge in Loxora, organized around a shared purpose.

A project is independent from any particular repository, folder, tool, or model.

### Knowledge Space

A logical subdivision within a project used to organize knowledge by domain, responsibility, or access boundary.

Examples may include Architecture, Gameplay, Characters, Lore, Research, or Business.

Knowledge Spaces are conceptual and do not prescribe physical storage.

### Source

External information from which knowledge may be extracted or verified.

Examples include repositories, files, documents, images, audio, chats, issues, commits, and APIs.

Sources are inputs and evidence; they are not automatically canonical knowledge.

### Knowledge

Structured understanding that remains relevant to interpreting or working on a project.

### Knowledge Node

The smallest independently understandable, linkable, reviewable, and reusable unit of project knowledge.

### Relationship

A meaningful, typed, and traceable connection between knowledge items, sources, people, agents, or projects.

Examples include depends on, implements, contradicts, supersedes, restores, and derives from.

### Knowledge Graph

The graph of knowledge and relationships within a project.

### Project Graph

The graph of relationships between projects, including technical dependencies, shared assets, conceptual reuse, lineage, and controlled knowledge transfer.

### Knowledge Revision

An immutable recorded representation of a Knowledge Node at a specific point in its history.

A change creates a new revision rather than silently modifying a previously accepted revision.

### Knowledge Version

A human-meaningful identifier or grouping for one or more revisions. The exact versioning scheme is intentionally undecided.

### Knowledge State

The lifecycle state applied to a knowledge revision or proposal.

Candidate states include Draft, Proposed, Reviewed, Canonical, Deprecated, Superseded, Historical, Rejected, Archived, and Restored. The authoritative state machine will be defined in RFC-003.

### Canonical Knowledge

The currently accepted knowledge that should be used for present decisions and default context generation.

Canonical does not mean permanently true. It means currently accepted under the project's governance policy.

### Historical Knowledge

Knowledge retained to explain previous project states, decisions, implementations, or understanding.

Historical Knowledge must not be presented as current without explicit labeling.

### Deprecated Knowledge

Knowledge that remains relevant or temporarily usable but should no longer be preferred.

Deprecated knowledge may still describe a currently supported legacy path.

### Superseded Knowledge

Knowledge that has been actively replaced by newer canonical knowledge.

### Restored Knowledge

A new canonical revision derived from an earlier historical revision after a rollback or intentional restoration.

The restored revision is new; history is not rewritten.

### Archived Knowledge

Knowledge preserved for recordkeeping but excluded from ordinary active workflows and default context.

### Active Knowledge

Knowledge eligible for ordinary retrieval and context generation under the current task and project state.

### Inactive Knowledge

Valid knowledge intentionally excluded from ordinary retrieval because it is dormant, completed, irrelevant to current work, or restricted by policy.

Inactive is not the same as historical or invalid.

### Proposal

Knowledge suggested by an agent but not yet accepted as canonical shared knowledge.

### Evidence

Traceable information supporting or contradicting a knowledge claim.

### Provenance

The recorded origin and history of a knowledge item, including source, proposing agent, review actions, timestamps, and lineage.

### Confidence

A measure of assessed certainty. Confidence never replaces evidence or review.

### Review

The process of evaluating a proposal or revision according to project governance.

### Context Package

A temporary, task-specific collection of current knowledge assembled for an agent or human.

Historical knowledge may be included only when relevant and explicitly labeled.

### Profile

A domain-specific interpretation layer that guides how Loxora extracts and organizes knowledge for different project types.

### Connector

A bridge between Loxora and an external tool or system. Connectors exchange information but do not own project knowledge.

### Agent

A human or AI entity capable of reading, proposing, reviewing, or consuming project knowledge.

### Reflection

Structured learning recorded after work, including changes, discoveries, failures, lessons, and recommendations.

### Bootstrap

The initial creation of project knowledge from existing sources.

### Rollback

A project change that reverses or restores an earlier implementation, decision, or knowledge state.

A rollback creates new history. It does not delete the reverted period.

## Reserved distinctions

The following distinctions must remain explicit:

- Source vs. Knowledge
- Knowledge vs. Context Package
- Canonical vs. Historical
- Deprecated vs. Superseded
- Restored vs. Rewritten history
- Active vs. Canonical
- Project Graph vs. Knowledge Graph
- Proposal vs. Canonical Knowledge
- Confidence vs. Evidence
- Agent vs. Model

## Future extensions

The formal lifecycle and allowed state transitions will be defined in RFC-003.

New terminology should extend this document rather than silently redefining existing concepts.
