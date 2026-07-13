# RFC-002 — Core Concepts & Terminology

**Status:** Draft  
**Version:** 0.3  
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

Terminology must clearly distinguish current knowledge from previous, deprecated, superseded, rejected, restored, or planned knowledge.

## Core concepts

### Workspace

A logical environment containing one or more projects and defining boundaries for membership, visibility, governance, and permitted knowledge sharing.

Examples include Personal, Team, and Organization Workspaces.

### Project

The primary long-term unit of knowledge in Loxora, organized around a shared purpose.

A project is independent from any particular repository, folder, tool, or model.

### Project Map

The primary orientation layer for a project.

A Project Map summarizes the project's purpose, major Knowledge Spaces, important current knowledge, planned changes, risks, conflicts, external sources, dependencies, and navigation gaps.

It is a map of available knowledge, not a replacement for detailed knowledge.

### Workspace Map

A workspace-level orientation layer that summarizes projects, their purposes, access boundaries, important relationships, and shared knowledge areas.

### Knowledge Space

A logical subdivision within a project used to organize knowledge by domain, responsibility, or access boundary.

Examples may include Architecture, Gameplay, Characters, Lore, Research, Security, Operations, or Business.

Knowledge Spaces are conceptual and do not prescribe physical storage.

### Space Index

A navigational index for a Knowledge Space.

It lists important collections or knowledge items with concise descriptions, scope, temporal relevance, and key relationships so that users and agents can decide what to open next.

### Knowledge Collection

A coherent grouping of related knowledge that is useful to navigate together.

Examples include a subsystem, feature, character arc, research topic, incident, migration, or business process.

A collection organizes and summarizes knowledge but does not replace the underlying canonical knowledge.

### Knowledge Index

A derived navigational representation that points to knowledge items and explains their relevance.

Indexes may exist at workspace, project, space, collection, temporal, or cross-project level.

### Knowledge Summary

A compact derived representation of underlying knowledge.

A Knowledge Summary must preserve scope, provenance, temporal distinctions, uncertainty, freshness, and links to the knowledge or sources it summarizes.

### Source

External information from which knowledge may be extracted or verified.

Examples include repositories, files, documents, images, audio, chats, issues, commits, and APIs.

Sources are inputs and evidence; they are not automatically canonical knowledge.

### Knowledge

Structured understanding that remains relevant to interpreting or working on a project.

### Knowledge Node

The smallest independently understandable, linkable, reviewable, and reusable unit of project knowledge.

### Knowledge Claim

A potentially smaller independently assessable statement contained within or associated with a Knowledge Node.

Claim-level lifecycle remains an open architectural question and is not yet mandatory.

### Relationship

A meaningful, typed, and traceable connection between knowledge items, sources, people, agents, or projects.

Examples include depends on, implements, contradicts, supersedes, restores, derives from, affects, planned for, shared with, and reused by.

### Navigation Path

A meaningful route from a map, index, collection, or search result to more detailed knowledge, related knowledge, evidence, history, or another project.

### Knowledge Graph

The graph of knowledge and relationships within a project.

### Project Graph

The graph of relationships between projects, including technical dependencies, shared assets, conceptual reuse, lineage, migration, and controlled knowledge transfer.

### Knowledge Revision

An immutable recorded representation of a Knowledge Node at a specific point in its history.

A change creates a new revision rather than silently modifying a previously accepted revision.

### Knowledge Version

A human-meaningful identifier or grouping for one or more revisions. The exact versioning scheme is intentionally undecided.

### Knowledge State

The lifecycle state applied to a knowledge revision or proposal.

Candidate states include Draft, Proposed, Reviewed, Canonical, Deprecated, Superseded, Historical, Rejected, Archived, and Restored. The authoritative state model is defined in RFC-003.

### Canonical Knowledge

The currently accepted knowledge that should be used for present decisions and default context generation.

Canonical does not mean permanently true. It means currently accepted under the project's governance policy and within a defined scope.

### Historical Knowledge

Knowledge retained to explain previous project states, decisions, implementations, or understanding.

Historical Knowledge must not be presented as current without explicit labeling.

### Planned Knowledge

Knowledge describing a possible, proposed, approved, in-progress, deferred, or abandoned future state.

Planned Knowledge is not current fact and must never be presented as already implemented merely because it is approved or highly connected.

### Temporal View

A navigational perspective that organizes knowledge by time and applicability.

The primary Temporal Views are Past, Current, and Planned.

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

Historical or planned knowledge may be included only when relevant and explicitly separated.

### Profile

A domain-specific interpretation layer that guides how Loxora extracts and organizes knowledge for different project types.

### Connector

A bridge between Loxora and an external tool or system. Connectors exchange information but do not own project knowledge.

### Agent

A human or AI entity capable of reading, proposing, reviewing, or consuming project knowledge.

### Conversation Digest

A structured distillation of a conversation containing durable project knowledge such as decisions, requirements, rationale, rejected alternatives, open questions, discoveries, risks, and plans.

The source conversation remains evidence and provenance.

### Shared Knowledge

Knowledge made available to more than one authorized human or agent within a defined workspace, project, team, or organization scope.

Shared Knowledge remains subject to permissions, provenance, review, and governance.

### Reflection

Structured learning recorded after work, including changes, discoveries, failures, lessons, and recommendations.

### Bootstrap

The initial creation of project knowledge and navigational structure from existing sources.

### Rollback

A project change that reverses or restores an earlier implementation, decision, or knowledge state.

A rollback creates new history. It does not delete the reverted period.

### Orphaned Knowledge

Knowledge that lacks a meaningful navigation path from an applicable Project Map, Space Index, Collection, or other explicit index.

### Stale Summary

A Knowledge Summary or index that no longer reliably represents its underlying knowledge because relevant inputs changed, became invalid, or were superseded.

### Navigation Health

The assessed quality of the paths by which users and agents find and understand knowledge.

Signals may include orphaned knowledge, broken links, stale summaries, duplicates, missing cross-project relationships, and important nodes without clear entry paths.

## Reserved distinctions

The following distinctions must remain explicit:

- Source vs. Knowledge
- Knowledge vs. Context Package
- Canonical vs. Historical vs. Planned
- Deprecated vs. Superseded
- Restored vs. Rewritten history
- Active vs. Canonical
- Project Graph vs. Knowledge Graph
- Project Map vs. Knowledge Graph
- Knowledge Summary vs. Canonical Knowledge
- Proposal vs. Canonical Knowledge
- Confidence vs. Evidence
- Agent vs. Model
- Shared vs. Unrestricted
- Search result vs. Navigation Path

## Future extensions

New terminology should extend this document rather than silently redefining existing concepts.

The exact storage and generation behavior for maps, indexes, collections, summaries, and claims remains an architectural decision.