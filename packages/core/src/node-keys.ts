import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "./errors.js";
import { DEFAULT_PLANNED_KNOWLEDGE_POLICY, type PlannedKnowledgePolicy } from "./planned.js";
import type { Clock, IdGenerator } from "./ports.js";
import type { AuditEvent, CorrelationId, NodeId, ProjectId } from "./types.js";

/** 1 to 32 characters: a letter or digit, then letters, digits, ".", "_", or "-" (ADR-006). */
export const NODE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

export interface NodeKey {
  readonly projectId: ProjectId;
  readonly nodeId: NodeId;
  /** As entered; uniqueness within the Project is case-insensitive. */
  readonly key: string;
  readonly assignedBy: string;
  readonly assignedAt: string;
}

/**
 * What a key would be bound to: an existing Node, or the reserved Node id of a
 * submitted proposal whose Node is created on acceptance.
 */
export type NodeKeyTarget = "Node" | "PendingProposal";

export interface NodeKeyStore {
  nodeKeyTarget(input: { projectId: ProjectId; nodeId: NodeId }): Promise<NodeKeyTarget | null>;
  /** Fails with ValidationError when the key or the Node already has a key. */
  assignNodeKey(key: NodeKey, auditEvent: AuditEvent): Promise<NodeKey>;
  getNodeKeys(input: { projectId: ProjectId }): Promise<readonly NodeKey[]>;
}

const defaultIds: IdGenerator = { next: () => randomUUID() };
const defaultClock: Clock = { now: () => new Date().toISOString() };

export function normalizeNodeKey(key: string): string {
  return key.toLowerCase();
}

export function assertNodeKey(key: string): string {
  const value = key.trim();
  if (!NODE_KEY_PATTERN.test(value)) {
    throw new ValidationError(
      `Invalid Node key "${key}": use 1 to 32 letters, digits, ".", "_", or "-", starting with a letter or digit`,
    );
  }
  return value;
}

/**
 * Assigns immutable, never reused Node keys (ADR-006, G4). A key can be bound to the
 * reserved Node of a pending proposal by any actor. Keys for existing Nodes are
 * retroactive and need an actor the policy allows to decide (a workspace reviewer).
 */
export class NodeKeyService {
  public constructor(
    private readonly store: NodeKeyStore,
    private readonly ids: IdGenerator = defaultIds,
    private readonly clock: Clock = defaultClock,
    private readonly policy: PlannedKnowledgePolicy = DEFAULT_PLANNED_KNOWLEDGE_POLICY,
  ) {}

  public async assignNodeKey(input: {
    projectId: ProjectId;
    nodeId: NodeId;
    key: string;
    actorId: string;
  }): Promise<NodeKey> {
    const key = assertNodeKey(input.key);
    const actorId = input.actorId.trim();
    if (!actorId) throw new ValidationError("Actor must not be empty");
    const target = await this.store.nodeKeyTarget({
      projectId: input.projectId,
      nodeId: input.nodeId,
    });
    if (!target) throw new NotFoundError(`Node ${input.nodeId} was not found`);
    if (target === "Node" && !this.policy.mayDecide(actorId)) {
      throw new ValidationError(
        `Actor "${actorId}" may not assign a key to an existing Node; keys are immutable, so retroactive keys need a reviewer`,
      );
    }
    const assignedAt = this.clock.now();
    const record: NodeKey = Object.freeze({
      projectId: input.projectId,
      nodeId: input.nodeId,
      key,
      assignedBy: actorId,
      assignedAt,
    });
    return this.store.assignNodeKey(
      record,
      Object.freeze({
        id: this.ids.next() as AuditEvent["id"],
        projectId: input.projectId,
        type: "NodeKeyAssigned",
        aggregateType: "KnowledgeNode",
        aggregateId: input.nodeId,
        actorId,
        occurredAt: assignedAt,
        correlationId: this.ids.next() as CorrelationId,
        payload: Object.freeze({ key, target }),
        evidenceReferenceIds: Object.freeze([]),
      }),
    );
  }

  public getNodeKeys(input: { projectId: ProjectId }): Promise<readonly NodeKey[]> {
    return this.store.getNodeKeys(input);
  }
}
