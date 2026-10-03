import {
  WORKSPACE_EXPORT_SECTIONS,
  workspaceExportRecords,
  type WorkspaceExport,
  type WorkspaceExportRecord,
} from "@loxora/core";
import { CliUsageError } from "./workspace.js";

const MIN_PREFIX_LENGTH = 6;

export interface EffectivePlan {
  readonly id: string;
  readonly ownerProjectId: string;
  readonly relatedProjectId: string | null;
  readonly title: string;
  readonly status: string;
  readonly revisionNumber: number;
  readonly createdAt: string;
}

/**
 * Resolves human references (ids, unique id prefixes, or unique names) to records.
 * Built from the workspace export so the CLI needs no additional store queries (ADR-004).
 */
export class WorkspaceDirectory {
  public constructor(private readonly document: WorkspaceExport) {}

  public records(section: string): readonly WorkspaceExportRecord[] {
    const spec = WORKSPACE_EXPORT_SECTIONS.find((entry) => entry.name === section);
    if (!spec) throw new Error(`Unknown section ${section}`);
    return workspaceExportRecords(this.document, spec);
  }

  public project(reference: string): WorkspaceExportRecord {
    return pick(this.records("projects"), reference, "name", "Project");
  }

  public space(projectId: string, reference: string): WorkspaceExportRecord {
    return pick(
      this.records("knowledgeSpaces").filter((record) => record.projectId === projectId),
      reference,
      "name",
      "Space",
    );
  }

  public collection(projectId: string, reference: string, spaceId?: string): WorkspaceExportRecord {
    return pick(
      this.records("knowledgeCollections").filter(
        (record) => record.projectId === projectId && (!spaceId || record.spaceId === spaceId),
      ),
      reference,
      "name",
      "Collection",
    );
  }

  /** Resolves a Node by id, key (case-insensitive), unique title, or id prefix (ADR-006). */
  public node(projectId: string, reference: string): WorkspaceExportRecord {
    const wanted = reference.trim();
    const keyed = this.records("knowledgeNodeKeys").find(
      (record) => record.projectId === projectId && record.keyNormalized === wanted.toLowerCase(),
    );
    if (keyed && keyed.nodeId !== wanted) {
      const node = this.records("knowledgeNodes").find(
        (record) => record.id === keyed.nodeId && record.projectId === projectId,
      );
      if (node) return node;
      const proposal = this.records("knowledgeProposals").find(
        (record) => record.proposedNodeId === keyed.nodeId && record.status === "Submitted",
      );
      throw new CliUsageError(
        proposal
          ? `Node "${keyed.key}" has no accepted knowledge yet; proposal ${proposal.id} is awaiting review`
          : `Node "${keyed.key}" has no accepted knowledge`,
      );
    }
    const pending = this.records("knowledgeProposals").find(
      (proposal) =>
        proposal.projectId === projectId &&
        proposal.status === "Submitted" &&
        proposal.proposedNodeTitle === reference.trim(),
    );
    const nodes = this.records("knowledgeNodes").filter((record) => record.projectId === projectId);
    if (
      pending &&
      !nodes.some((node) => node.title === reference.trim() || node.id === reference.trim())
    ) {
      throw new CliUsageError(
        `Node "${reference.trim()}" has no accepted knowledge yet; proposal ${pending.id} is awaiting review`,
      );
    }
    return pick(nodes, reference, "title", "Node");
  }

  public source(reference: string, projectId?: string): WorkspaceExportRecord {
    return pick(scoped(this.records("sourceReferences"), projectId), reference, "title", "Source");
  }

  public evidence(reference: string, projectId?: string): WorkspaceExportRecord {
    return pick(scoped(this.records("evidenceReferences"), projectId), reference, null, "Evidence");
  }

  public proposal(reference: string): WorkspaceExportRecord {
    return pick(this.records("knowledgeProposals"), reference, null, "Proposal");
  }

  /** The immutable key of a Node, if it has one. */
  public nodeKey(nodeId: unknown): string | null {
    const record = this.records("knowledgeNodeKeys").find((entry) => entry.nodeId === nodeId);
    return record ? String(record.key) : null;
  }

  /** Whether the key is already used in the Project (keys are never reused). */
  public keyTaken(projectId: string, key: string): boolean {
    return this.records("knowledgeNodeKeys").some(
      (record) => record.projectId === projectId && record.keyNormalized === key.toLowerCase(),
    );
  }

  /** Resolves any reviewable item: a knowledge Proposal or a plan revision proposal. */
  public reviewable(
    reference: string,
  ):
    | { readonly kind: "KnowledgeProposal"; readonly record: WorkspaceExportRecord }
    | { readonly kind: "PlanRevisionProposal"; readonly record: WorkspaceExportRecord } {
    const records = [
      ...this.records("knowledgeProposals").map((record) => ({
        kind: "KnowledgeProposal" as const,
        record,
      })),
      ...this.records("plannedKnowledgeRevisions")
        .filter((record) => record.kind === "Proposal")
        .map((record) => ({ kind: "PlanRevisionProposal" as const, record })),
    ];
    const wanted = reference.trim();
    const exact = records.find((entry) => entry.record.id === wanted);
    if (exact) return exact;
    const matches =
      wanted.length >= MIN_PREFIX_LENGTH
        ? records.filter((entry) => String(entry.record.id).startsWith(wanted))
        : [];
    if (matches.length === 1 && matches[0]) return matches[0];
    if (matches.length > 1) {
      throw new CliUsageError(
        `Proposal "${wanted}" is ambiguous (${matches.length} matches); use the full id`,
      );
    }
    throw new CliUsageError(`Proposal "${wanted}" was not found`);
  }

  /** Plans with their effective title, status, and revision number (ADR-006). */
  public plans(projectId?: string): readonly EffectivePlan[] {
    const latest = new Map<unknown, WorkspaceExportRecord>();
    for (const revision of this.records("plannedKnowledgeRevisions")) {
      if (revision.kind !== "Revision") continue;
      const known = latest.get(revision.plannedKnowledgeId);
      if (!known || Number(revision.revisionNumber) > Number(known.revisionNumber)) {
        latest.set(revision.plannedKnowledgeId, revision);
      }
    }
    return this.records("plannedKnowledgeItems")
      .map((item) => {
        const revision = latest.get(item.id);
        return {
          id: String(item.id),
          ownerProjectId: String(item.ownerProjectId),
          relatedProjectId:
            (revision ? revision.relatedProjectId : item.relatedProjectId) === null
              ? null
              : String(revision ? revision.relatedProjectId : item.relatedProjectId),
          title: String(revision?.title ?? item.title),
          status: String(revision?.status ?? item.status),
          revisionNumber: revision ? Number(revision.revisionNumber) : 1,
          createdAt: String(item.createdAt),
        };
      })
      .filter(
        (plan) =>
          !projectId || plan.ownerProjectId === projectId || plan.relatedProjectId === projectId,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  /** Resolves a plan by id, unique effective title, or id prefix. */
  public plan(reference: string, projectId?: string): EffectivePlan {
    const plans = this.plans(projectId);
    const wanted = reference.trim();
    const byId = plans.find((plan) => plan.id === wanted);
    if (byId) return byId;
    for (const matches of [
      plans.filter((plan) => plan.title === wanted),
      wanted.length >= MIN_PREFIX_LENGTH ? plans.filter((plan) => plan.id.startsWith(wanted)) : [],
    ]) {
      if (matches.length === 1 && matches[0]) return matches[0];
      if (matches.length > 1) {
        throw new CliUsageError(
          `Plan "${wanted}" is ambiguous (${matches.length} matches); use the full id`,
        );
      }
    }
    throw new CliUsageError(`Plan "${wanted}" was not found`);
  }

  public relationshipProposal(reference: string): WorkspaceExportRecord {
    return pick(
      this.records("crossProjectRelationshipProposals"),
      reference,
      null,
      "Relationship Proposal",
    );
  }
}

function scoped(
  records: readonly WorkspaceExportRecord[],
  projectId: string | undefined,
): readonly WorkspaceExportRecord[] {
  return projectId ? records.filter((record) => record.projectId === projectId) : records;
}

function pick(
  records: readonly WorkspaceExportRecord[],
  reference: string,
  nameField: string | null,
  label: string,
): WorkspaceExportRecord {
  const wanted = reference.trim();
  const byId = records.find((record) => record.id === wanted);
  if (byId) return byId;
  const candidates = [
    nameField ? records.filter((record) => record[nameField] === wanted) : [],
    wanted.length >= MIN_PREFIX_LENGTH
      ? records.filter((record) => String(record.id).startsWith(wanted))
      : [],
  ];
  for (const matches of candidates) {
    if (matches.length === 1 && matches[0]) return matches[0];
    if (matches.length > 1) {
      throw new CliUsageError(
        `${label} "${wanted}" is ambiguous (${matches.length} matches); use the full id`,
      );
    }
  }
  throw new CliUsageError(`${label} "${wanted}" was not found`);
}
