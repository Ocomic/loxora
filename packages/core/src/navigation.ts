import { createHash, randomUUID } from "node:crypto";
import type { Clock, IdGenerator, NavigationStore } from "./ports.js";
import type {
  AuditEventId,
  CollectionId,
  CorrelationId,
  EvidenceReferenceId,
  NavigationHealth,
  NodeId,
  ProjectId,
  ProjectMap,
  RebuildNavigationProjectionResult,
  Scope,
  SourceReferenceId,
  SpaceId,
} from "./types.js";
import { DEFAULT_SCOPE } from "./types.js";

export const NAVIGATION_PROJECTION_VERSION = 1;
export const NAVIGATION_FINGERPRINT_VERSION = "sha256-canonical-json-v1";

export interface NavigationCanonicalSnapshot {
  readonly content: unknown;
  readonly activity: unknown;
}

export interface NavigationFingerprints {
  readonly version: typeof NAVIGATION_FINGERPRINT_VERSION;
  readonly content: string;
  readonly activity: string;
}

/** One replaceable deterministic fingerprint builder for fallback and persisted projections. */
export class NavigationProjectionBuilder {
  public fingerprints(snapshot: NavigationCanonicalSnapshot): NavigationFingerprints {
    return Object.freeze({
      version: NAVIGATION_FINGERPRINT_VERSION,
      content: this.hash(snapshot.content),
      activity: this.hash(snapshot.activity),
    });
  }

  public preview(content: string): string {
    const normalized = content.trim().replace(/\s+/gu, " ");
    const points = Array.from(normalized);
    return points.length <= 160 ? normalized : `${points.slice(0, 157).join("")}...`;
  }

  private hash(value: unknown): string {
    return createHash("sha256").update(stableJson(value)).digest("hex");
  }
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

const defaultIds: IdGenerator = { next: () => randomUUID() };
const defaultClock: Clock = { now: () => new Date().toISOString() };

export class NavigationService {
  public constructor(
    private readonly store: NavigationStore,
    private readonly idGenerator: IdGenerator = defaultIds,
    private readonly clock: Clock = defaultClock,
  ) {}

  public getProjectMap(input: { projectId: ProjectId; scope?: Scope }): Promise<ProjectMap | null> {
    return this.store.getProjectMap({ ...input, scope: input.scope ?? DEFAULT_SCOPE });
  }

  public getSpaceNavigation(input: { projectId: ProjectId; spaceId: SpaceId; scope?: Scope }) {
    return this.store.getSpaceNavigation({ ...input, scope: input.scope ?? DEFAULT_SCOPE });
  }

  public getCollectionNavigation(input: {
    projectId: ProjectId;
    collectionId: CollectionId;
    scope?: Scope;
  }) {
    return this.store.getCollectionNavigation({ ...input, scope: input.scope ?? DEFAULT_SCOPE });
  }

  public getNodeNavigation(input: { projectId: ProjectId; nodeId: NodeId; scope?: Scope }) {
    return this.store.getNodeNavigation({ ...input, scope: input.scope ?? DEFAULT_SCOPE });
  }

  public getEvidenceNavigation(input: {
    projectId: ProjectId;
    evidenceReferenceId: EvidenceReferenceId;
  }) {
    return this.store.getEvidenceNavigation(input);
  }

  public getSourceNavigation(input: {
    projectId: ProjectId;
    sourceReferenceId: SourceReferenceId;
  }) {
    return this.store.getSourceNavigation(input);
  }

  public getNavigationHealth(input: {
    projectId: ProjectId;
    scope?: Scope;
  }): Promise<NavigationHealth | null> {
    return this.store.getNavigationHealth({ ...input, scope: input.scope ?? DEFAULT_SCOPE });
  }

  public rebuildNavigationProjection(input: {
    projectId: ProjectId;
    scope?: Scope;
    actorId: string;
  }): Promise<RebuildNavigationProjectionResult> {
    return this.store.rebuildNavigationProjection({
      projectId: input.projectId,
      scope: input.scope ?? DEFAULT_SCOPE,
      actorId: input.actorId.trim(),
      generationId: this.idGenerator.next(),
      correlationId: this.idGenerator.next() as CorrelationId,
      auditEventIds: Object.freeze([
        this.idGenerator.next() as AuditEventId,
        this.idGenerator.next() as AuditEventId,
        this.idGenerator.next() as AuditEventId,
      ]),
      occurredAt: this.clock.now(),
    });
  }
}
