import {
  WORKSPACE_EXPORT_SECTIONS,
  workspaceExportRecords,
  type WorkspaceExport,
  type WorkspaceExportRecord,
} from "@loxora/core";
import { CliUsageError } from "./workspace.js";

const MIN_PREFIX_LENGTH = 6;

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

  public node(projectId: string, reference: string): WorkspaceExportRecord {
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
