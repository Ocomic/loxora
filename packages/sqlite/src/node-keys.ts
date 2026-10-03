import type { DatabaseSync } from "node:sqlite";
import {
  type AuditEvent,
  type NodeId,
  type NodeKey,
  type NodeKeyStore,
  type NodeKeyTarget,
  normalizeNodeKey,
  type ProjectId,
  ValidationError,
} from "@loxora/core";

type Row = Record<string, string | null>;

export class SqliteNodeKeyStore implements NodeKeyStore {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly insertAudit: (event: AuditEvent) => void,
  ) {}

  public async nodeKeyTarget(input: {
    projectId: ProjectId;
    nodeId: NodeId;
  }): Promise<NodeKeyTarget | null> {
    if (
      this.database
        .prepare("SELECT 1 FROM knowledge_nodes WHERE id=? AND project_id=?")
        .get(input.nodeId, input.projectId) !== undefined
    ) {
      return "Node";
    }
    return this.database
      .prepare(
        "SELECT 1 FROM knowledge_proposals WHERE proposed_node_id=? AND project_id=? AND status='Submitted'",
      )
      .get(input.nodeId, input.projectId) !== undefined
      ? "PendingProposal"
      : null;
  }

  public async assignNodeKey(key: NodeKey, auditEvent: AuditEvent): Promise<NodeKey> {
    const normalized = normalizeNodeKey(key.key);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const taken = this.database
        .prepare("SELECT node_id FROM knowledge_node_keys WHERE project_id=? AND key_normalized=?")
        .get(key.projectId, normalized) as Row | undefined;
      if (taken) {
        throw new ValidationError(
          `Key "${key.key}" is already used in this Project${taken.node_id === key.nodeId ? " by this Node" : ""}; keys are never reused`,
        );
      }
      const existing = this.database
        .prepare("SELECT key FROM knowledge_node_keys WHERE node_id=?")
        .get(key.nodeId) as Row | undefined;
      if (existing) {
        throw new ValidationError(`Node already has the immutable key "${existing.key}"`);
      }
      this.database
        .prepare(
          "INSERT INTO knowledge_node_keys (project_id,key_normalized,key,node_id,assigned_by,assigned_at) VALUES (?,?,?,?,?,?)",
        )
        .run(key.projectId, normalized, key.key, key.nodeId, key.assignedBy, key.assignedAt);
      this.insertAudit(auditEvent);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    return key;
  }

  public async getNodeKeys(input: { projectId: ProjectId }): Promise<readonly NodeKey[]> {
    return Object.freeze(
      (
        this.database
          .prepare("SELECT * FROM knowledge_node_keys WHERE project_id=? ORDER BY key_normalized")
          .all(input.projectId) as Row[]
      ).map((row) =>
        Object.freeze({
          projectId: row.project_id as ProjectId,
          nodeId: row.node_id as NodeId,
          key: row.key as string,
          assignedBy: row.assigned_by as string,
          assignedAt: row.assigned_at as string,
        }),
      ),
    );
  }
}
