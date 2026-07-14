import { randomUUID } from "node:crypto";
import { ValidationError } from "./errors.js";
import type {
  Clock,
  CreateKnowledgeCollectionInput,
  CreateKnowledgeSpaceInput,
  CreateProjectInput,
  IdGenerator,
  LifecycleStore,
  RegisterEvidenceReferenceInput,
  RegisterSourceReferenceInput,
  RecordRollbackInput,
  ReviewKnowledgeProposalInput,
  SubmitKnowledgeProposalInput,
  SubmitRestorationProposalInput,
  SubmitSuccessorProposalInput,
} from "./ports.js";
import type {
  AuditEvent,
  AuditEventId,
  CollectionId,
  CorrelationId,
  CurrentKnowledge,
  EvidenceReference,
  EvidenceReferenceId,
  KnowledgeCollection,
  KnowledgeHistory,
  KnowledgeProposal,
  KnowledgeSpace,
  NodeId,
  Project,
  ProjectId,
  ProposalId,
  ReviewDecisionId,
  ReviewKnowledgeProposalResult,
  RevisionId,
  RevisionRelationshipId,
  RollbackEvent,
  RollbackEventId,
  RecordRollbackResult,
  Scope,
  SourceReference,
  SourceReferenceId,
  SpaceId,
} from "./types.js";
import { DEFAULT_SCOPE } from "./types.js";

const defaultIdGenerator: IdGenerator = { next: () => randomUUID() };
const defaultClock: Clock = { now: () => new Date().toISOString() };

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ValidationError(`${field} must not be empty`);
  }
  return normalized;
}

function requiredList<T>(values: readonly T[], field: string): readonly T[] {
  if (values.length === 0) {
    throw new ValidationError(`${field} must contain at least one item`);
  }
  return Object.freeze([...new Set(values)]);
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

export class LifecycleService {
  public constructor(
    private readonly store: LifecycleStore,
    private readonly idGenerator: IdGenerator = defaultIdGenerator,
    private readonly clock: Clock = defaultClock,
  ) {}

  public async createProject(input: CreateProjectInput): Promise<Project> {
    const createdAt = this.clock.now();
    const project = freeze({
      id: input.id ?? (this.idGenerator.next() as ProjectId),
      name: required(input.name, "Project name"),
      createdAt,
    });
    await this.store.createProject(
      project,
      this.audit(project.id, "ProjectCreated", "Project", project.id, input.actorId, createdAt),
    );
    return project;
  }

  public async createKnowledgeSpace(input: CreateKnowledgeSpaceInput): Promise<KnowledgeSpace> {
    const createdAt = this.clock.now();
    const space = freeze({
      id: input.id ?? (this.idGenerator.next() as SpaceId),
      projectId: input.projectId,
      name: required(input.name, "Knowledge Space name"),
      createdAt,
    });
    await this.store.createKnowledgeSpace(
      space,
      this.audit(
        input.projectId,
        "KnowledgeSpaceCreated",
        "KnowledgeSpace",
        space.id,
        input.actorId,
        createdAt,
      ),
    );
    return space;
  }

  public async createKnowledgeCollection(
    input: CreateKnowledgeCollectionInput,
  ): Promise<KnowledgeCollection> {
    const createdAt = this.clock.now();
    const collection = freeze({
      id: input.id ?? (this.idGenerator.next() as CollectionId),
      projectId: input.projectId,
      spaceId: input.spaceId,
      name: required(input.name, "Knowledge Collection name"),
      createdAt,
    });
    await this.store.createKnowledgeCollection(
      collection,
      this.audit(
        input.projectId,
        "KnowledgeCollectionCreated",
        "KnowledgeCollection",
        collection.id,
        input.actorId,
        createdAt,
      ),
    );
    return collection;
  }

  public async registerSourceReference(
    input: RegisterSourceReferenceInput,
  ): Promise<SourceReference> {
    const createdAt = this.clock.now();
    const source = freeze({
      id: input.id ?? (this.idGenerator.next() as SourceReferenceId),
      projectId: input.projectId,
      kind: required(input.kind, "Source kind"),
      locator: required(input.locator, "Source locator"),
      title: required(input.title, "Source title"),
      createdAt,
    });
    await this.store.registerSourceReference(
      source,
      this.audit(
        input.projectId,
        "SourceReferenceRegistered",
        "SourceReference",
        source.id,
        input.actorId,
        createdAt,
      ),
    );
    return source;
  }

  public async registerEvidenceReference(
    input: RegisterEvidenceReferenceInput,
  ): Promise<EvidenceReference> {
    const createdAt = this.clock.now();
    const evidence = freeze({
      id: input.id ?? (this.idGenerator.next() as EvidenceReferenceId),
      projectId: input.projectId,
      sourceReferenceId: input.sourceReferenceId,
      summary: required(input.summary, "Evidence summary"),
      locator: required(input.locator, "Evidence locator"),
      createdAt,
    });
    await this.store.registerEvidenceReference(
      evidence,
      this.audit(
        input.projectId,
        "EvidenceReferenceRegistered",
        "EvidenceReference",
        evidence.id,
        input.actorId,
        createdAt,
      ),
    );
    return evidence;
  }

  public async submitKnowledgeProposal(
    input: SubmitKnowledgeProposalInput,
  ): Promise<KnowledgeProposal> {
    const createdAt = this.clock.now();
    const proposal = freeze({
      id: input.id ?? (this.idGenerator.next() as ProposalId),
      projectId: input.projectId,
      spaceId: input.spaceId,
      collectionId: input.collectionId,
      proposedNodeId: input.proposedNodeId ?? (this.idGenerator.next() as NodeId),
      proposedNodeTitle: required(input.proposedNodeTitle, "Proposed Node title"),
      proposedContent: required(input.proposedContent, "Proposed content"),
      sourceReferenceIds: requiredList(input.sourceReferenceIds, "Source references"),
      evidenceReferenceIds: requiredList(input.evidenceReferenceIds, "Evidence references"),
      proposerId: required(input.proposerId, "Proposer identity"),
      createdAt,
      scope: this.scope(input.scope),
      status: "Submitted" as const,
      kind: "Initial" as const,
      changeReason: null,
      expectedPredecessorRevisionId: null,
      rollbackEventId: null,
      restorationSourceRevisionId: null,
    });
    await this.store.submitProposal(
      proposal,
      this.audit(
        input.projectId,
        "ProposalSubmitted",
        "KnowledgeProposal",
        proposal.id,
        input.proposerId,
        createdAt,
      ),
    );
    return proposal;
  }

  public async submitSuccessorProposal(
    input: SubmitSuccessorProposalInput,
  ): Promise<KnowledgeProposal> {
    const scope = this.scope(input.scope);
    const current = await this.store.getCurrentKnowledge({
      projectId: input.projectId,
      nodeId: input.nodeId,
      scope,
    });
    if (!current) {
      throw new ValidationError("Successor Proposal requires Current Knowledge");
    }
    const createdAt = this.clock.now();
    const proposal = freeze({
      id: input.id ?? (this.idGenerator.next() as ProposalId),
      projectId: input.projectId,
      spaceId: current.space.id,
      collectionId: current.collection.id,
      proposedNodeId: input.nodeId,
      proposedNodeTitle: current.node.title,
      proposedContent: required(input.proposedContent, "Proposed content"),
      sourceReferenceIds: requiredList(input.sourceReferenceIds, "Source references"),
      evidenceReferenceIds: requiredList(input.evidenceReferenceIds, "Evidence references"),
      proposerId: required(input.proposerId, "Proposer identity"),
      createdAt,
      scope,
      status: "Submitted" as const,
      kind: "Successor" as const,
      changeReason: required(input.changeReason, "Change reason"),
      expectedPredecessorRevisionId: input.expectedCurrentRevisionId,
      rollbackEventId: null,
      restorationSourceRevisionId: null,
    });
    await this.store.submitProposal(
      proposal,
      this.audit(
        input.projectId,
        "SuccessorProposalSubmitted",
        "KnowledgeProposal",
        proposal.id,
        input.proposerId,
        createdAt,
        proposal.evidenceReferenceIds,
      ),
    );
    return proposal;
  }

  public async recordRollback(input: RecordRollbackInput): Promise<RecordRollbackResult> {
    const recordedAt = this.clock.now();
    const correlationId = this.idGenerator.next() as CorrelationId;
    const event = freeze({
      id: input.id ?? (this.idGenerator.next() as RollbackEventId),
      projectId: input.projectId,
      nodeId: input.nodeId,
      scope: this.scope(input.scope),
      revertedRevisionId: input.revertedRevisionId,
      semanticSourceRevisionId: input.semanticSourceRevisionId,
      actorId: required(input.actorId, "Actor identity"),
      reason: required(input.reason, "Rollback reason"),
      evidenceReferenceIds: requiredList(input.evidenceReferenceIds, "Rollback Evidence"),
      recordedAt,
      correlationId,
    }) as RollbackEvent;
    return this.store.recordRollback(
      event,
      freeze({
        id: this.idGenerator.next() as AuditEventId,
        projectId: input.projectId,
        type: "RollbackRecorded",
        aggregateType: "RollbackEvent",
        aggregateId: event.id,
        actorId: event.actorId,
        occurredAt: recordedAt,
        correlationId,
        payload: freeze({
          revertedRevisionId: event.revertedRevisionId,
          semanticSourceRevisionId: event.semanticSourceRevisionId,
          reason: event.reason,
        }),
        evidenceReferenceIds: event.evidenceReferenceIds,
      }),
    );
  }

  public async submitRestorationProposal(
    input: SubmitRestorationProposalInput,
  ): Promise<KnowledgeProposal> {
    const rollback = await this.store.getRollbackEvent({
      projectId: input.projectId,
      rollbackEventId: input.rollbackEventId,
    });
    if (!rollback) {
      throw new ValidationError(`Rollback Event ${input.rollbackEventId} was not found`);
    }
    const current = await this.store.getCurrentKnowledge({
      projectId: input.projectId,
      nodeId: rollback.nodeId,
      scope: rollback.scope,
    });
    if (!current) {
      throw new ValidationError("Restoration Proposal requires Current Knowledge");
    }
    const createdAt = this.clock.now();
    const proposal = freeze({
      id: input.id ?? (this.idGenerator.next() as ProposalId),
      projectId: input.projectId,
      spaceId: current.space.id,
      collectionId: current.collection.id,
      proposedNodeId: rollback.nodeId,
      proposedNodeTitle: current.node.title,
      proposedContent: required(input.proposedContent, "Proposed content"),
      sourceReferenceIds: requiredList(input.sourceReferenceIds, "Source references"),
      evidenceReferenceIds: requiredList(input.evidenceReferenceIds, "Evidence references"),
      proposerId: required(input.proposerId, "Proposer identity"),
      createdAt,
      scope: rollback.scope,
      status: "Submitted" as const,
      kind: "Restoration" as const,
      changeReason: required(input.changeReason, "Change reason"),
      expectedPredecessorRevisionId: rollback.revertedRevisionId,
      rollbackEventId: rollback.id,
      restorationSourceRevisionId: rollback.semanticSourceRevisionId,
    });
    await this.store.submitProposal(
      proposal,
      this.audit(
        input.projectId,
        "RestorationProposalSubmitted",
        "KnowledgeProposal",
        proposal.id,
        input.proposerId,
        createdAt,
        proposal.evidenceReferenceIds,
      ),
    );
    return proposal;
  }

  public async reviewKnowledgeProposal(
    input: ReviewKnowledgeProposalInput,
  ): Promise<ReviewKnowledgeProposalResult> {
    const decidedAt = this.clock.now();
    const accepted = input.decision === "Accepted";
    const auditCount = accepted ? 5 : 2;
    const auditEventIds = Array.from(
      { length: auditCount },
      () => this.idGenerator.next() as AuditEventId,
    );
    return this.store.reviewProposal({
      proposalId: input.proposalId,
      projectId: input.projectId,
      reviewerId: required(input.reviewerId, "Reviewer identity"),
      decision: input.decision,
      reason: required(input.reason, "Review reason"),
      scope: this.scope(input.scope),
      evidenceReferenceIds: requiredList(input.evidenceReferenceIds, "Review Evidence"),
      decidedAt,
      reviewDecisionId: this.idGenerator.next() as ReviewDecisionId,
      revisionId: accepted ? (this.idGenerator.next() as RevisionId) : null,
      correlationId: this.idGenerator.next() as CorrelationId,
      auditEventIds,
      relationshipIds: Array.from(
        { length: 4 },
        () => this.idGenerator.next() as RevisionRelationshipId,
      ),
    });
  }

  public async getKnowledgeHistory(input: {
    readonly projectId: ProjectId;
    readonly nodeId: NodeId;
    readonly scope?: Scope;
  }): Promise<KnowledgeHistory | null> {
    return this.store.getKnowledgeHistory({ ...input, scope: this.scope(input.scope) });
  }

  public async getCurrentKnowledge(input: {
    readonly projectId: ProjectId;
    readonly nodeId: NodeId;
    readonly scope?: Scope;
  }): Promise<CurrentKnowledge | null> {
    return this.store.getCurrentKnowledge({ ...input, scope: this.scope(input.scope) });
  }

  public async close(): Promise<void> {
    await this.store.close();
  }

  private scope(scope: Scope | undefined): Scope {
    return (required(scope ?? DEFAULT_SCOPE, "Scope") || DEFAULT_SCOPE) as Scope;
  }

  private audit(
    projectId: ProjectId,
    type: AuditEvent["type"],
    aggregateType: string,
    aggregateId: string,
    actorId: string,
    occurredAt: string,
    evidenceReferenceIds: readonly EvidenceReferenceId[] = [],
  ): AuditEvent {
    return freeze({
      id: this.idGenerator.next() as AuditEventId,
      projectId,
      type,
      aggregateType,
      aggregateId,
      actorId: required(actorId, "Actor identity"),
      occurredAt,
      correlationId: this.idGenerator.next() as CorrelationId,
      payload: freeze({}),
      evidenceReferenceIds: Object.freeze([...evidenceReferenceIds]),
    });
  }
}
