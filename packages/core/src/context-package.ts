import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { Clock, LifecycleStore, NavigationStore } from "./ports.js";
import type { CrossProjectImpactStore, ImpactPath, ReadableProjects } from "./cross-project.js";
import { ValidationError } from "./errors.js";
import type {
  EvidenceReference,
  EvidenceReferenceId,
  NavigationPath,
  NodeId,
  ProjectId,
  RevisionId,
  RevisionRole,
  Scope,
  SourceReference,
} from "./types.js";
import { DEFAULT_SCOPE } from "./types.js";

export const CONTEXT_ESTIMATOR_ID = "utf8-bytes-div-3-ceil-v1";
export const CONTEXT_PACKAGE_FINGERPRINT_VERSION = "sha256-context-package-json-v1";

export type ContextTemporalView = "Current" | "History";
export type ContextRelationshipType = "DependsOn";
export type ContextEntryKind = "Knowledge" | "History" | "Dependency" | "Evidence" | "Inaccessible";
export type ContextBudgetStatus =
  | "WithinBudget"
  | "WithinBudgetWithOmissions"
  | "OverBudgetMandatory";

export interface BuildContextPackageInput {
  readonly projectId: ProjectId;
  readonly focusNodeIds: readonly NodeId[];
  readonly temporalViews?: readonly ContextTemporalView[];
  readonly includeRelatedProjects?: boolean;
  readonly relationshipTypes?: readonly ContextRelationshipType[];
  readonly maxDependencyDepth?: 0 | 1;
  readonly taskLabel: string;
  readonly estimatedTokenBudget: number;
  readonly visibility: ReadableProjects;
  readonly explicitEvidenceReferenceIds?: readonly EvidenceReferenceId[];
  readonly estimatorId?: typeof CONTEXT_ESTIMATOR_ID;
  readonly scope?: Scope;
}

export interface NormalizedContextPackageRequest {
  readonly projectId: ProjectId;
  readonly focusNodeIds: readonly NodeId[];
  readonly temporalViews: readonly ContextTemporalView[];
  readonly includeRelatedProjects: boolean;
  readonly relationshipTypes: readonly ContextRelationshipType[];
  readonly maxDependencyDepth: 0 | 1;
  readonly taskLabel: string;
  readonly estimatedTokenBudget: number;
  readonly readableProjectIds: readonly ProjectId[];
  readonly revealRestrictedProjectIds: boolean;
  readonly explicitEvidenceReferenceIds: readonly EvidenceReferenceId[];
  readonly estimatorId: typeof CONTEXT_ESTIMATOR_ID;
  readonly scope: Scope;
}

export interface ContextRevisionSnapshot {
  readonly revisionId: RevisionId;
  readonly content: string;
  readonly revisionRole: RevisionRole;
  readonly lifecycleClassifications: readonly string[];
  readonly temporalClassification: "Current" | "Historical";
  readonly acceptedAt: string;
}

export interface ContextPackageEntry {
  readonly id: string;
  readonly kind: ContextEntryKind;
  readonly projectId: ProjectId | null;
  readonly nodeId: NodeId | null;
  readonly revisionIds: readonly RevisionId[];
  readonly temporalClassification: "Current" | "Historical" | null;
  readonly lifecycleClassifications: readonly string[];
  readonly inclusionReasons: readonly string[];
  readonly navigationPaths: readonly NavigationPath[];
  readonly revisions: readonly ContextRevisionSnapshot[];
  readonly evidence: readonly EvidenceReference[];
  readonly sources: readonly SourceReference[];
  readonly dependencyPath: ImpactPath | null;
  readonly impactAssessmentId: string | null;
  readonly impactSeverity: string | null;
  readonly relationshipBindingFreshness: "Fresh" | "Stale" | null;
  readonly assessmentFreshness: "Fresh" | "Stale" | null;
  readonly inaccessibleReferenceId: string | null;
  readonly mandatory: boolean;
  readonly estimatedTokens: number;
}

export interface ContextPackageOmission {
  readonly candidateId: string;
  readonly reason: "BudgetExceeded";
  readonly estimatedTokens: number;
}

export interface ContextPackage {
  readonly id: string;
  readonly generatedAt: string;
  readonly taskLabel: string;
  readonly request: NormalizedContextPackageRequest;
  readonly estimatorId: typeof CONTEXT_ESTIMATOR_ID;
  readonly fingerprintVersion: typeof CONTEXT_PACKAGE_FINGERPRINT_VERSION;
  readonly fingerprint: string;
  readonly entries: readonly ContextPackageEntry[];
  readonly includedProjectIds: readonly ProjectId[];
  readonly includedNodeIds: readonly NodeId[];
  readonly includedRevisionIds: readonly RevisionId[];
  readonly followedDependencyPaths: readonly ImpactPath[];
  readonly staleInputs: readonly string[];
  readonly inaccessibleReferences: readonly string[];
  readonly omissions: readonly ContextPackageOmission[];
  readonly requestedBudget: number;
  readonly estimatedUsage: number;
  readonly remainingBudget: number;
  readonly budgetStatus: ContextBudgetStatus;
  readonly warnings: readonly string[];
}

export interface ContextPackageStore
  extends Pick<LifecycleStore, "getCurrentKnowledge" | "getKnowledgeHistory" | "close">,
    Pick<NavigationStore, "getEvidenceNavigation">,
    Pick<CrossProjectImpactStore, "getProjectDependencies"> {}

interface Candidate {
  readonly entry: Omit<ContextPackageEntry, "estimatedTokens">;
  readonly priority: number;
}

export class Utf8BytesDiv3CeilEstimator {
  public readonly id = CONTEXT_ESTIMATOR_ID;

  public estimate(value: unknown): number {
    return Math.ceil(Buffer.byteLength(stableJson(value), "utf8") / 3);
  }
}

const defaultClock: Clock = { now: () => new Date().toISOString() };

export class ContextPackageService {
  public constructor(
    private readonly store: ContextPackageStore,
    private readonly clock: Clock = defaultClock,
    private readonly estimator = new Utf8BytesDiv3CeilEstimator(),
  ) {}

  public async buildContextPackage(input: BuildContextPackageInput): Promise<ContextPackage> {
    const request = normalizeRequest(input);
    if (!request.readableProjectIds.includes(request.projectId))
      throw new ValidationError("Primary Project is not readable");

    const candidates: Candidate[] = [];
    const warnings = new Set<string>();
    const staleInputs = new Set<string>();
    const inaccessibleReferences = new Set<string>();

    for (const nodeId of request.focusNodeIds) {
      const current = await this.store.getCurrentKnowledge({
        projectId: request.projectId,
        nodeId,
        scope: request.scope,
      });
      if (!current) throw new ValidationError(`Focus Node ${nodeId} has no Current knowledge`);
      candidates.push({ entry: currentEntry(current, "ExplicitFocusCurrent", true), priority: 1 });
      if (request.temporalViews.includes("History")) {
        const history = await this.store.getKnowledgeHistory({
          projectId: request.projectId,
          nodeId,
          scope: request.scope,
        });
        if (history) candidates.push({ entry: historyEntry(history), priority: 2 });
      }
    }

    for (const evidenceId of request.explicitEvidenceReferenceIds) {
      const evidence = await this.store.getEvidenceNavigation({
        projectId: request.projectId,
        evidenceReferenceId: evidenceId,
      });
      if (!evidence) throw new ValidationError(`Explicit Evidence ${evidenceId} was not found`);
      candidates.push({ entry: evidenceEntry(evidence, "ExplicitEvidence", true), priority: 3 });
    }

    if (
      request.includeRelatedProjects &&
      request.maxDependencyDepth === 1 &&
      request.relationshipTypes.includes("DependsOn")
    ) {
      const dependencies = await this.store.getProjectDependencies({
        projectId: request.projectId,
        scope: request.scope,
        direction: "Both",
        access: {
          readableProjectIds: request.readableProjectIds,
          revealRestrictedProjectIds: request.revealRestrictedProjectIds,
        },
      });
      for (const dependency of dependencies) {
        const relationship = dependency.relationship;
        const touchesFocus = request.focusNodeIds.some(
          (nodeId) =>
            (relationship.source.projectId === request.projectId &&
              relationship.source.nodeId === nodeId) ||
            (relationship.target.projectId === request.projectId &&
              relationship.target.nodeId === nodeId),
        );
        if (!touchesFocus) continue;
        const path = dependency.path;
        if (path.relationshipBindingFreshness === "Stale")
          staleInputs.add(`relationship:${relationship.id}`);
        if (path.assessmentFreshness === "Stale" && path.assessment)
          staleInputs.add(`assessment:${path.assessment.id}`);
        for (const warning of path.warnings) warnings.add(warning);
        for (const endpoint of [path.provider, path.consumer]) {
          if (endpoint.inaccessible && endpoint.inaccessibleReferenceId) {
            inaccessibleReferences.add(endpoint.inaccessibleReferenceId);
          }
        }
        candidates.push({ entry: dependencyEntry(path), priority: 4 });

        const related =
          relationship.source.projectId === request.projectId
            ? relationship.target
            : relationship.source;
        if (request.readableProjectIds.includes(related.projectId)) {
          const relatedCurrent = await this.store.getCurrentKnowledge({
            projectId: related.projectId,
            nodeId: related.nodeId,
            scope: request.scope,
          });
          if (relatedCurrent) {
            candidates.push({
              entry: currentEntry(relatedCurrent, "RelatedCurrentDependency", true),
              priority: 6,
            });
          }
        } else {
          const inaccessible = [path.provider, path.consumer].find(
            (endpoint) => endpoint.inaccessible,
          );
          candidates.push({
            entry: inaccessibleEntry(
              relationship.id,
              inaccessible?.projectId ?? null,
              inaccessible?.inaccessibleReferenceId ?? `restricted:${relationship.id}`,
            ),
            priority: 6,
          });
        }

        if (path.assessment) {
          const attached = new Set(path.evidence.map((item) => `${item.projectId}:${item.id}`));
          for (const qualified of path.assessment.evidence) {
            if (attached.has(`${qualified.projectId}:${qualified.evidenceReferenceId}`)) continue;
            if (!request.readableProjectIds.includes(qualified.projectId)) continue;
            const detail = await this.store.getEvidenceNavigation({
              projectId: qualified.projectId,
              evidenceReferenceId: qualified.evidenceReferenceId,
            });
            if (detail)
              candidates.push({
                entry: evidenceEntry(detail, "AdditionalAssessmentEvidence", false),
                priority: 7,
              });
          }
        }
      }
    }

    const merged = mergeCandidates(candidates);
    const mandatory = merged.filter((candidate) => candidate.entry.mandatory);
    const optional = merged.filter((candidate) => !candidate.entry.mandatory);
    const entries: ContextPackageEntry[] = mandatory.map((candidate) =>
      withEstimate(candidate.entry, this.estimator),
    );
    let usage = entries.reduce((total, entry) => total + entry.estimatedTokens, 0);
    const omissions: ContextPackageOmission[] = [];
    for (const candidate of optional) {
      const entry = withEstimate(candidate.entry, this.estimator);
      if (usage + entry.estimatedTokens <= request.estimatedTokenBudget) {
        entries.push(entry);
        usage += entry.estimatedTokens;
      } else {
        omissions.push(
          freeze({
            candidateId: entry.id,
            reason: "BudgetExceeded" as const,
            estimatedTokens: entry.estimatedTokens,
          }),
        );
      }
    }
    entries.sort(entryCompare);
    const overBudget = usage > request.estimatedTokenBudget;
    if (overBudget) warnings.add("OverBudgetMandatory");
    const budgetStatus: ContextBudgetStatus = overBudget
      ? "OverBudgetMandatory"
      : omissions.length > 0
        ? "WithinBudgetWithOmissions"
        : "WithinBudget";
    const followedDependencyPaths = entries
      .map((entry) => entry.dependencyPath)
      .filter((path): path is ImpactPath => path !== null);
    const includedProjectIds = sortedUnique(
      entries.flatMap((entry) => (entry.projectId ? [entry.projectId] : [])),
    ) as ProjectId[];
    const includedNodeIds = sortedUnique(
      entries.flatMap((entry) => (entry.nodeId ? [entry.nodeId] : [])),
    ) as NodeId[];
    const includedRevisionIds = sortedUnique(
      entries.flatMap((entry) => entry.revisionIds),
    ) as RevisionId[];
    const fingerprintBasis = {
      request,
      entries,
      includedProjectIds,
      includedNodeIds,
      includedRevisionIds,
      followedDependencyPaths,
      staleInputs: [...staleInputs].sort(),
      inaccessibleReferences: [...inaccessibleReferences].sort(),
      omissions,
      requestedBudget: request.estimatedTokenBudget,
      estimatedUsage: usage,
      remainingBudget: Math.max(0, request.estimatedTokenBudget - usage),
      budgetStatus,
      warnings: [...warnings].sort(),
    };
    const fingerprint = createHash("sha256").update(stableJson(fingerprintBasis)).digest("hex");
    return deepFreeze({
      ...fingerprintBasis,
      id: `context:${fingerprint}`,
      generatedAt: this.clock.now(),
      taskLabel: request.taskLabel,
      estimatorId: CONTEXT_ESTIMATOR_ID,
      fingerprintVersion: CONTEXT_PACKAGE_FINGERPRINT_VERSION,
      fingerprint,
    });
  }
}

function normalizeRequest(input: BuildContextPackageInput): NormalizedContextPackageRequest {
  const taskLabel = input.taskLabel.trim();
  if (!taskLabel) throw new ValidationError("Task label must not be empty");
  if (!Number.isSafeInteger(input.estimatedTokenBudget) || input.estimatedTokenBudget < 1)
    throw new ValidationError("Estimated token budget must be a positive safe integer");
  const depth = input.maxDependencyDepth ?? 0;
  if (depth !== 0 && depth !== 1)
    throw new ValidationError("Maximum dependency depth must be zero or one");
  if (input.estimatorId && input.estimatorId !== CONTEXT_ESTIMATOR_ID)
    throw new ValidationError(`Unsupported estimator ${input.estimatorId}`);
  const focusNodeIds = sortedUnique(input.focusNodeIds) as NodeId[];
  if (focusNodeIds.length === 0) throw new ValidationError("At least one focus Node is required");
  const temporal = new Set(input.temporalViews ?? ["Current"]);
  for (const view of temporal) {
    if (view !== "Current" && view !== "History")
      throw new ValidationError(`Unsupported temporal view ${view}`);
  }
  temporal.add("Current");
  const relationships = sortedUnique(input.relationshipTypes ?? []) as ContextRelationshipType[];
  for (const type of relationships) {
    if (type !== "DependsOn") throw new ValidationError(`Unsupported relationship type ${type}`);
  }
  const readableProjectIds = sortedUnique(input.visibility.readableProjectIds) as ProjectId[];
  return deepFreeze({
    projectId: input.projectId,
    focusNodeIds,
    temporalViews: ["Current", ...(temporal.has("History") ? (["History"] as const) : [])],
    includeRelatedProjects: input.includeRelatedProjects ?? false,
    relationshipTypes: relationships,
    maxDependencyDepth: depth,
    taskLabel,
    estimatedTokenBudget: input.estimatedTokenBudget,
    readableProjectIds,
    revealRestrictedProjectIds: input.visibility.revealRestrictedProjectIds ?? false,
    explicitEvidenceReferenceIds: sortedUnique(
      input.explicitEvidenceReferenceIds ?? [],
    ) as EvidenceReferenceId[],
    estimatorId: CONTEXT_ESTIMATOR_ID,
    scope: input.scope ?? DEFAULT_SCOPE,
  });
}

function currentEntry(
  current: NonNullable<Awaited<ReturnType<LifecycleStore["getCurrentKnowledge"]>>>,
  reason: string,
  mandatory: boolean,
): Omit<ContextPackageEntry, "estimatedTokens"> {
  return deepFreeze({
    id: `current:${current.project.id}:${current.node.id}:${current.revision.id}`,
    kind: "Knowledge" as const,
    projectId: current.project.id,
    nodeId: current.node.id,
    revisionIds: [current.revision.id],
    temporalClassification: "Current" as const,
    lifecycleClassifications: ["Canonical", current.revisionRole],
    inclusionReasons: [reason],
    navigationPaths: [current.navigationPath],
    revisions: [
      {
        revisionId: current.revision.id,
        content: current.revision.content,
        revisionRole: current.revisionRole,
        lifecycleClassifications: ["Canonical"],
        temporalClassification: "Current" as const,
        acceptedAt: current.revision.acceptedAt,
      },
    ],
    evidence: current.evidence,
    sources: current.sources,
    dependencyPath: null,
    impactAssessmentId: null,
    impactSeverity: null,
    relationshipBindingFreshness: null,
    assessmentFreshness: null,
    inaccessibleReferenceId: null,
    mandatory,
  });
}

function historyEntry(
  history: NonNullable<Awaited<ReturnType<LifecycleStore["getKnowledgeHistory"]>>>,
): Omit<ContextPackageEntry, "estimatedTokens"> {
  return deepFreeze({
    id: `history:${history.project.id}:${history.node.id}`,
    kind: "History" as const,
    projectId: history.project.id,
    nodeId: history.node.id,
    revisionIds: history.entries.map((entry) => entry.revision.id),
    temporalClassification: "Historical" as const,
    lifecycleClassifications: ["AcceptedHistory"],
    inclusionReasons: ["ExplicitHistory"],
    navigationPaths: [history.navigationPath],
    revisions: history.entries.map((entry) => ({
      revisionId: entry.revision.id,
      content: entry.revision.content,
      revisionRole: entry.revisionRole,
      lifecycleClassifications: entry.classifications,
      temporalClassification: entry.isCurrent ? ("Current" as const) : ("Historical" as const),
      acceptedAt: entry.revision.acceptedAt,
    })),
    evidence: uniqueById(history.entries.flatMap((entry) => entry.evidence)),
    sources: uniqueById(history.entries.flatMap((entry) => entry.sources)),
    dependencyPath: null,
    impactAssessmentId: null,
    impactSeverity: null,
    relationshipBindingFreshness: null,
    assessmentFreshness: null,
    inaccessibleReferenceId: null,
    mandatory: true,
  });
}

function dependencyEntry(path: ImpactPath): Omit<ContextPackageEntry, "estimatedTokens"> {
  const inaccessible = [path.provider, path.consumer].find((endpoint) => endpoint.inaccessible);
  return deepFreeze({
    id: `dependency:${path.relationship.id}:${path.selectedProviderRevisionId}:${path.selectedConsumerRevisionId}`,
    kind: "Dependency" as const,
    projectId: path.consumer.projectId,
    nodeId: path.consumer.nodeId,
    revisionIds: [path.selectedProviderRevisionId, path.selectedConsumerRevisionId],
    temporalClassification: null,
    lifecycleClassifications: ["AcceptedRelationship"],
    inclusionReasons: ["AllowedOneHopDependency"],
    navigationPaths: [path.provider.path, path.consumer.path].filter(
      (value): value is NavigationPath => value !== null,
    ),
    revisions: [],
    evidence: path.evidence,
    sources: path.sources,
    dependencyPath: path,
    impactAssessmentId: path.assessment?.id ?? null,
    impactSeverity: path.assessment?.severity ?? null,
    relationshipBindingFreshness: path.relationshipBindingFreshness,
    assessmentFreshness: path.assessmentFreshness,
    inaccessibleReferenceId: inaccessible?.inaccessibleReferenceId ?? null,
    mandatory: true,
  });
}

function evidenceEntry(
  navigation: NonNullable<Awaited<ReturnType<NavigationStore["getEvidenceNavigation"]>>>,
  reason: string,
  mandatory: boolean,
): Omit<ContextPackageEntry, "estimatedTokens"> {
  return deepFreeze({
    id: `evidence:${navigation.evidence.projectId}:${navigation.evidence.id}`,
    kind: "Evidence" as const,
    projectId: navigation.evidence.projectId,
    nodeId: null,
    revisionIds: navigation.backlinks.flatMap((backlink) =>
      backlink.revisionId ? [backlink.revisionId] : [],
    ),
    temporalClassification: null,
    lifecycleClassifications: [],
    inclusionReasons: [reason],
    navigationPaths: navigation.backlinks.map((backlink) => backlink.path),
    revisions: [],
    evidence: [navigation.evidence],
    sources: [navigation.source],
    dependencyPath: null,
    impactAssessmentId: null,
    impactSeverity: null,
    relationshipBindingFreshness: null,
    assessmentFreshness: null,
    inaccessibleReferenceId: null,
    mandatory,
  });
}

function inaccessibleEntry(
  relationshipId: string,
  projectId: ProjectId | null,
  referenceId: string,
): Omit<ContextPackageEntry, "estimatedTokens"> {
  return deepFreeze({
    id: `inaccessible:${relationshipId}:${referenceId}`,
    kind: "Inaccessible" as const,
    projectId,
    nodeId: null,
    revisionIds: [],
    temporalClassification: null,
    lifecycleClassifications: [],
    inclusionReasons: ["RelatedEndpointInaccessible"],
    navigationPaths: [],
    revisions: [],
    evidence: [],
    sources: [],
    dependencyPath: null,
    impactAssessmentId: null,
    impactSeverity: null,
    relationshipBindingFreshness: null,
    assessmentFreshness: null,
    inaccessibleReferenceId: referenceId,
    mandatory: true,
  });
}

function mergeCandidates(candidates: readonly Candidate[]): Candidate[] {
  const merged = new Map<string, Candidate>();
  for (const candidate of [...candidates].sort(candidateCompare)) {
    const prior = merged.get(candidate.entry.id);
    if (!prior) {
      merged.set(candidate.entry.id, candidate);
      continue;
    }
    merged.set(candidate.entry.id, {
      priority: Math.min(prior.priority, candidate.priority),
      entry: deepFreeze({
        ...prior.entry,
        inclusionReasons: sortedUnique([
          ...prior.entry.inclusionReasons,
          ...candidate.entry.inclusionReasons,
        ]),
        mandatory: prior.entry.mandatory || candidate.entry.mandatory,
      }),
    });
  }
  return [...merged.values()].sort(candidateCompare);
}

function withEstimate(
  entry: Omit<ContextPackageEntry, "estimatedTokens">,
  estimator: Utf8BytesDiv3CeilEstimator,
): ContextPackageEntry {
  return deepFreeze({ ...entry, estimatedTokens: estimator.estimate(entry) });
}

function candidateCompare(left: Candidate, right: Candidate): number {
  return left.priority - right.priority || left.entry.id.localeCompare(right.entry.id);
}

function entryCompare(left: ContextPackageEntry, right: ContextPackageEntry): number {
  const priority: Record<ContextEntryKind, number> = {
    Knowledge: 1,
    History: 2,
    Evidence: 3,
    Dependency: 4,
    Inaccessible: 5,
  };
  return priority[left.kind] - priority[right.kind] || left.id.localeCompare(right.id);
}

function uniqueById<T extends { id: string; projectId: ProjectId }>(values: readonly T[]): T[] {
  return [
    ...new Map(values.map((value) => [`${value.projectId}:${value.id}`, value])).values(),
  ].sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId) || left.id.localeCompare(right.id),
  );
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function stableContextJson(value: unknown): string {
  return stableJson(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
