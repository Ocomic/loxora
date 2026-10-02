import { createHash } from "node:crypto";
import { ValidationError } from "./errors.js";

export const WORKSPACE_EXPORT_FORMAT = "loxora.workspace-export";
export const WORKSPACE_EXPORT_FORMAT_VERSION = 1;

export type WorkspaceExportValue = string | number | null;
export type WorkspaceExportRecord = Readonly<Record<string, WorkspaceExportValue>>;

export interface WorkspaceExportSectionSpec {
  readonly name: string;
  readonly fields: readonly string[];
  readonly key: readonly string[];
}

const section = (
  name: string,
  key: readonly string[],
  fields: readonly string[],
): WorkspaceExportSectionSpec => Object.freeze({ name, key, fields });

/**
 * Canonical sections of format version 1, in restore order (ADR-003).
 * Field names are part of the public export contract; changing them requires a new format version.
 */
export const WORKSPACE_EXPORT_SECTIONS: readonly WorkspaceExportSectionSpec[] = Object.freeze([
  section("projects", ["id"], ["id", "name", "purpose", "createdAt"]),
  section("knowledgeSpaces", ["id"], ["id", "projectId", "name", "description", "createdAt"]),
  section(
    "knowledgeCollections",
    ["id"],
    ["id", "projectId", "spaceId", "name", "description", "createdAt"],
  ),
  section(
    "knowledgeNodes",
    ["id"],
    ["id", "projectId", "spaceId", "collectionId", "title", "createdAt"],
  ),
  section("sourceReferences", ["id"], ["id", "projectId", "kind", "locator", "title", "createdAt"]),
  section(
    "evidenceReferences",
    ["id"],
    ["id", "projectId", "sourceReferenceId", "summary", "locator", "createdAt"],
  ),
  section(
    "knowledgeProposals",
    ["id"],
    [
      "id",
      "projectId",
      "spaceId",
      "collectionId",
      "proposedNodeId",
      "proposedNodeTitle",
      "proposedContent",
      "proposerId",
      "createdAt",
      "scope",
      "status",
      "proposalKind",
      "changeReason",
      "expectedPredecessorRevisionId",
      "rollbackEventId",
      "restorationSourceRevisionId",
    ],
  ),
  section(
    "proposalSources",
    ["proposalId", "sourceReferenceId"],
    ["proposalId", "projectId", "sourceReferenceId"],
  ),
  section(
    "proposalEvidence",
    ["proposalId", "evidenceReferenceId"],
    ["proposalId", "projectId", "evidenceReferenceId"],
  ),
  section(
    "reviewDecisions",
    ["id"],
    [
      "id",
      "proposalId",
      "projectId",
      "reviewerId",
      "decision",
      "reason",
      "decidedAt",
      "scope",
      "correlationId",
    ],
  ),
  section(
    "reviewDecisionEvidence",
    ["reviewDecisionId", "evidenceReferenceId"],
    ["reviewDecisionId", "projectId", "evidenceReferenceId"],
  ),
  section(
    "knowledgeRevisions",
    ["id"],
    [
      "id",
      "projectId",
      "nodeId",
      "scope",
      "content",
      "proposalId",
      "reviewDecisionId",
      "proposerId",
      "reviewerId",
      "acceptedAt",
      "correlationId",
    ],
  ),
  section(
    "revisionEvidence",
    ["revisionId", "evidenceReferenceId"],
    ["revisionId", "projectId", "evidenceReferenceId"],
  ),
  section(
    "currentRevisions",
    ["projectId", "nodeId", "scope"],
    ["projectId", "nodeId", "scope", "revisionId", "assignedAt", "correlationId"],
  ),
  section(
    "rollbackEvents",
    ["id"],
    [
      "id",
      "projectId",
      "nodeId",
      "scope",
      "revertedRevisionId",
      "semanticSourceRevisionId",
      "actorId",
      "reason",
      "recordedAt",
      "correlationId",
    ],
  ),
  section(
    "rollbackEventEvidence",
    ["rollbackEventId", "evidenceReferenceId"],
    ["rollbackEventId", "projectId", "evidenceReferenceId"],
  ),
  section(
    "revisionRelationships",
    ["id"],
    [
      "id",
      "projectId",
      "nodeId",
      "scope",
      "sourceRevisionId",
      "targetRevisionId",
      "relationshipType",
      "rollbackEventId",
      "createdAt",
      "correlationId",
    ],
  ),
  section(
    "revisionRelationshipEvidence",
    ["revisionRelationshipId", "evidenceReferenceId"],
    ["revisionRelationshipId", "projectId", "evidenceReferenceId"],
  ),
  section(
    "crossProjectRelationshipProposals",
    ["id"],
    [
      "id",
      "sourceProjectId",
      "sourceNodeId",
      "sourceRevisionId",
      "targetProjectId",
      "targetNodeId",
      "targetRevisionId",
      "scope",
      "relationshipType",
      "confidence",
      "reason",
      "visibility",
      "proposerId",
      "proposedAt",
      "status",
      "correlationId",
    ],
  ),
  section(
    "crossProjectRelationshipProposalEvidence",
    ["proposalId", "evidenceProjectId", "evidenceReferenceId"],
    [
      "proposalId",
      "sourceProjectId",
      "targetProjectId",
      "evidenceProjectId",
      "evidenceReferenceId",
    ],
  ),
  section(
    "crossProjectRelationshipReviewDecisions",
    ["id"],
    [
      "id",
      "proposalId",
      "sourceProjectId",
      "targetProjectId",
      "reviewerId",
      "decision",
      "reason",
      "decidedAt",
      "correlationId",
    ],
  ),
  section(
    "crossProjectRelationshipReviewEvidence",
    ["reviewDecisionId", "evidenceProjectId", "evidenceReferenceId"],
    [
      "reviewDecisionId",
      "sourceProjectId",
      "targetProjectId",
      "evidenceProjectId",
      "evidenceReferenceId",
    ],
  ),
  section(
    "crossProjectRelationships",
    ["id"],
    [
      "id",
      "proposalId",
      "reviewDecisionId",
      "sourceProjectId",
      "sourceNodeId",
      "sourceRevisionId",
      "targetProjectId",
      "targetNodeId",
      "targetRevisionId",
      "scope",
      "relationshipType",
      "confidence",
      "reason",
      "visibility",
      "acceptedAt",
      "reviewerId",
      "correlationId",
    ],
  ),
  section(
    "crossProjectRelationshipEvidence",
    ["relationshipId", "evidenceProjectId", "evidenceReferenceId"],
    [
      "relationshipId",
      "sourceProjectId",
      "targetProjectId",
      "evidenceProjectId",
      "evidenceReferenceId",
    ],
  ),
  section(
    "impactAssessments",
    ["id"],
    [
      "id",
      "relationshipId",
      "sourceProjectId",
      "targetProjectId",
      "providerRevisionId",
      "consumerRevisionId",
      "changeCompatibility",
      "consumerRequirement",
      "operationalCriticality",
      "observedFailure",
      "changeSummary",
      "consumerConstraint",
      "consequence",
      "severity",
      "confidence",
      "severityEvaluatorVersion",
      "basisFingerprintVersion",
      "basisFingerprint",
      "requestingActorId",
      "assessedAt",
      "correlationId",
    ],
  ),
  section(
    "impactAssessmentEvidence",
    ["assessmentId", "evidenceProjectId", "evidenceReferenceId"],
    [
      "assessmentId",
      "sourceProjectId",
      "targetProjectId",
      "evidenceProjectId",
      "evidenceReferenceId",
    ],
  ),
  section(
    "plannedKnowledgeItems",
    ["id"],
    [
      "id",
      "ownerProjectId",
      "relatedProjectId",
      "title",
      "description",
      "status",
      "reason",
      "blockingCondition",
      "authorId",
      "createdAt",
      "scope",
      "relatedRevisionProjectId",
      "relatedRevisionId",
    ],
  ),
  section(
    "plannedKnowledgeNodes",
    ["plannedKnowledgeId", "nodeProjectId", "nodeId"],
    ["plannedKnowledgeId", "ownerProjectId", "nodeProjectId", "nodeId"],
  ),
  section(
    "plannedKnowledgeEvidence",
    ["plannedKnowledgeId", "evidenceProjectId", "evidenceReferenceId"],
    ["plannedKnowledgeId", "ownerProjectId", "evidenceProjectId", "evidenceReferenceId"],
  ),
  section(
    "auditEvents",
    ["id"],
    [
      "id",
      "projectId",
      "eventType",
      "aggregateType",
      "aggregateId",
      "actorId",
      "occurredAt",
      "correlationId",
      "payloadJson",
    ],
  ),
  section(
    "auditEventEvidence",
    ["auditEventId", "evidenceReferenceId"],
    ["auditEventId", "projectId", "evidenceReferenceId"],
  ),
]);

/** Derived navigation projections, exported verbatim under `sections.derived` (ADR-003). */
export const WORKSPACE_EXPORT_DERIVED_SECTIONS: readonly WorkspaceExportSectionSpec[] =
  Object.freeze([
    section(
      "navigationProjectionGenerations",
      ["id"],
      [
        "id",
        "projectId",
        "scope",
        "projectionVersion",
        "fingerprintVersion",
        "contentFingerprint",
        "activityFingerprint",
        "projectionJson",
        "rebuiltAt",
        "correlationId",
      ],
    ),
    section(
      "navigationProjectionState",
      ["projectId", "scope", "projectionVersion"],
      [
        "projectId",
        "scope",
        "projectionVersion",
        "activeGenerationId",
        "lastAttemptedAt",
        "lastFailure",
      ],
    ),
    section(
      "navigationProjectionEntries",
      ["generationId", "entityKind", "entityId"],
      [
        "generationId",
        "projectId",
        "scope",
        "entityKind",
        "entityId",
        "parentEntityId",
        "projectRefId",
        "spaceRefId",
        "collectionRefId",
        "nodeRefId",
        "displayName",
        "preview",
      ],
    ),
    section(
      "navigationProjectionWarnings",
      ["generationId", "category", "code", "entityKind", "entityId"],
      [
        "generationId",
        "projectId",
        "scope",
        "category",
        "code",
        "entityKind",
        "entityId",
        "detail",
        "warningJson",
      ],
    ),
  ]);

export type WorkspaceExportSections = Readonly<Record<string, readonly WorkspaceExportRecord[]>>;

export interface WorkspaceExportDocumentSections {
  readonly derived: WorkspaceExportSections;
  readonly [name: string]: readonly WorkspaceExportRecord[] | WorkspaceExportSections;
}

export interface WorkspaceExport {
  readonly format: typeof WORKSPACE_EXPORT_FORMAT;
  readonly formatVersion: typeof WORKSPACE_EXPORT_FORMAT_VERSION;
  readonly sourceSchema: readonly string[];
  readonly sections: WorkspaceExportDocumentSections;
}

/** Records of one canonical section, or of one derived section when `derived` is true. */
export function workspaceExportRecords(
  document: WorkspaceExport,
  spec: WorkspaceExportSectionSpec,
  derived = false,
): readonly WorkspaceExportRecord[] {
  const value = derived ? document.sections.derived[spec.name] : document.sections[spec.name];
  return Array.isArray(value) ? (value as readonly WorkspaceExportRecord[]) : [];
}

/** Throws ValidationError unless `value` is a complete, well-formed format-version-1 export. */
export function assertWorkspaceExport(value: unknown): asserts value is WorkspaceExport {
  const document = objectValue(value, "export document");
  exactKeys(document, ["format", "formatVersion", "sections", "sourceSchema"], "export document");
  if (document.format !== WORKSPACE_EXPORT_FORMAT) {
    throw new ValidationError(`Unsupported export format: ${String(document.format)}`);
  }
  if (document.formatVersion !== WORKSPACE_EXPORT_FORMAT_VERSION) {
    throw new ValidationError(
      `Unsupported export format version: ${String(document.formatVersion)}`,
    );
  }
  if (
    !Array.isArray(document.sourceSchema) ||
    !document.sourceSchema.every((id) => typeof id === "string")
  ) {
    throw new ValidationError("sourceSchema must be an array of migration ids");
  }
  const sections = objectValue(document.sections, "sections");
  exactKeys(
    sections,
    [...WORKSPACE_EXPORT_SECTIONS.map((spec) => spec.name), "derived"],
    "sections",
  );
  for (const spec of WORKSPACE_EXPORT_SECTIONS) assertSection(sections[spec.name], spec);
  const derived = objectValue(sections.derived, "sections.derived");
  exactKeys(
    derived,
    WORKSPACE_EXPORT_DERIVED_SECTIONS.map((spec) => spec.name),
    "sections.derived",
  );
  for (const spec of WORKSPACE_EXPORT_DERIVED_SECTIONS) assertSection(derived[spec.name], spec);
}

export function parseWorkspaceExport(text: string): WorkspaceExport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ValidationError("Export is not valid JSON");
  }
  assertWorkspaceExport(value);
  return value;
}

/** Canonical bytes per ADR-003: sorted keys, records sorted by key, 2-space indent, LF, trailing newline. */
export function serializeWorkspaceExport(document: WorkspaceExport): string {
  assertWorkspaceExport(document);
  const sortSections = (specs: readonly WorkspaceExportSectionSpec[], derived: boolean) =>
    Object.fromEntries(
      specs.map((spec) => [
        spec.name,
        sortRecords(workspaceExportRecords(document, spec, derived), spec.key),
      ]),
    );
  const canonical = {
    format: document.format,
    formatVersion: document.formatVersion,
    sourceSchema: [...document.sourceSchema].sort(compareCodePoints),
    sections: {
      ...sortSections(WORKSPACE_EXPORT_SECTIONS, false),
      derived: sortSections(WORKSPACE_EXPORT_DERIVED_SECTIONS, true),
    },
  };
  return `${JSON.stringify(sortKeys(canonical), null, 2)}\n`;
}

export function workspaceExportDigest(canonicalText: string): string {
  return createHash("sha256").update(canonicalText, "utf8").digest("hex");
}

function assertSection(value: unknown, spec: WorkspaceExportSectionSpec): void {
  if (!Array.isArray(value)) throw new ValidationError(`Section ${spec.name} must be an array`);
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const label = `${spec.name}[${index}]`;
    const record = objectValue(entry, label);
    exactKeys(record, spec.fields, label);
    for (const field of spec.fields) {
      const fieldValue = record[field];
      const valid =
        fieldValue === null ||
        typeof fieldValue === "string" ||
        (typeof fieldValue === "number" && Number.isFinite(fieldValue));
      if (!valid) throw new ValidationError(`${label}.${field} must be a string, number, or null`);
    }
    for (const field of spec.key) {
      if (record[field] === null)
        throw new ValidationError(`${label}.${field} is a key and cannot be null`);
    }
    const identity = JSON.stringify(spec.key.map((field) => record[field]));
    if (seen.has(identity)) throw new ValidationError(`${label} duplicates key ${identity}`);
    seen.add(identity);
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareCodePoints);
  const wanted = [...expected].sort(compareCodePoints);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ValidationError(
      `${label} must have exactly the fields [${wanted.join(", ")}], found [${actual.join(", ")}]`,
    );
  }
}

function sortRecords(
  records: readonly WorkspaceExportRecord[],
  key: readonly string[],
): WorkspaceExportRecord[] {
  return [...records].sort((left, right) => {
    for (const field of key) {
      const order = compareValues(left[field] ?? null, right[field] ?? null);
      if (order !== 0) return order;
    }
    return 0;
  });
}

function compareValues(left: WorkspaceExportValue, right: WorkspaceExportValue): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return compareCodePoints(String(left), String(right));
}

function compareCodePoints(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index]?.codePointAt(0) ?? 0) - (b[index]?.codePointAt(0) ?? 0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareCodePoints)
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
