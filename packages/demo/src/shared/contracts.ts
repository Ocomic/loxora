export const DEMO_STAGES = [
  "Prepared",
  "V1Accepted",
  "DependencyAccepted",
  "V2Accepted",
  "ImpactAssessed",
  "RollbackRecorded",
  "V3Restored",
  "Complete",
] as const;
export type DemoStage = (typeof DEMO_STAGES)[number];

export type DemoActionId =
  | "review-v1"
  | "review-dependency"
  | "review-v2"
  | "assess-impact"
  | "record-rollback"
  | "review-v3"
  | "inspect-temporal"
  | "confirm-temporal-review"
  | "build-context"
  | "view-mcp-proof"
  | "resume"
  | "reset";

export interface DemoAction {
  readonly id: DemoActionId;
  readonly label: string;
  readonly href: string;
  readonly intent: "Navigate" | "Mutation";
  readonly endpoint?: string;
  readonly enabled: boolean;
  readonly disabledReason?: string;
}

export interface GuidedStepDefinition {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly objective: string;
  readonly whatChanges: string;
  readonly whyItMatters: string;
  readonly expectedResult: string;
  readonly destination: string;
}

export interface GuidedPhaseDefinition {
  readonly id: "establish" | "change-recover" | "use-prove";
  readonly number: number;
  readonly title: string;
  readonly stepIds: readonly string[];
}

export const GUIDED_PHASES: readonly GuidedPhaseDefinition[] = Object.freeze([
  {
    id: "establish",
    number: 1,
    title: "Establish",
    stepIds: Object.freeze(["establish-knowledge", "connect-projects"]),
  },
  {
    id: "change-recover",
    number: 2,
    title: "Change & Recover",
    stepIds: Object.freeze([
      "breaking-change",
      "assess-impact",
      "record-rollback",
      "restore-knowledge",
    ]),
  },
  {
    id: "use-prove",
    number: 3,
    title: "Use & Prove",
    stepIds: Object.freeze(["compare-time", "build-context", "verify-mcp"]),
  },
]);

export const GUIDED_STEPS: readonly GuidedStepDefinition[] = Object.freeze([
  {
    id: "establish-knowledge",
    number: 1,
    title: "Establish project knowledge",
    objective: "Accept the prepared V1 knowledge for both projects.",
    whatChanges: "Each accepted Proposal creates immutable Current knowledge.",
    whyItMatters: "The dependency story needs a reviewed provider and consumer baseline.",
    expectedResult: "Both projects have traceable Current V1 revisions.",
    destination: "/reviews",
  },
  {
    id: "connect-projects",
    number: 2,
    title: "Connect the projects",
    objective: "Accept the reviewed DependsOn relationship.",
    whatChanges: "The consumer and provider become connected through frozen revision bindings.",
    whyItMatters: "Loxora can now explain consequences across project boundaries.",
    expectedResult: "The dependency is discoverable from both Project Maps.",
    destination: "/reviews",
  },
  {
    id: "breaking-change",
    number: 3,
    title: "Introduce a breaking change",
    objective: "Accept Token Format V2.",
    whatChanges: "subject_id replaces customer_id and V2 becomes Current.",
    whyItMatters: "The customer portal still requires customer_id.",
    expectedResult: "V1 remains Historical and the dependency binding becomes Stale.",
    destination: "/reviews",
  },
  {
    id: "assess-impact",
    number: 4,
    title: "Assess cross-project impact",
    objective: "Create the exact V2/consumer impact assessment.",
    whatChanges: "A High, evidence-backed Assessment is recorded without changing canon.",
    whyItMatters: "The compatibility failure becomes explicit and traceable.",
    expectedResult: "Relationship Stale, Assessment Fresh, severity High.",
    destination: "/impact",
  },
  {
    id: "record-rollback",
    number: 5,
    title: "Record the rollback",
    objective: "Record that V2 is no longer the desired active direction.",
    whatChanges: "A Rollback Event is added; no Revision is deleted or reactivated.",
    whyItMatters: "Rollback remains a traceable project decision.",
    expectedResult: "The rollback is recorded and restoration can be reviewed.",
    destination: "/impact",
  },
  {
    id: "restore-knowledge",
    number: 6,
    title: "Restore compatible knowledge",
    objective: "Accept the V3 restoration Proposal.",
    whatChanges: "V3 becomes a new Current Revision linked to V1 and V2.",
    whyItMatters: "Compatibility returns without rewriting history.",
    expectedResult: "V3 Current; V1 and V2 Historical; migration Planned.",
    destination: "/reviews",
  },
  {
    id: "compare-time",
    number: 7,
    title: "Compare Current, History, and Planned",
    objective: "Inspect the three temporal views side by side.",
    whatChanges: "Nothing canonical changes; the preserved knowledge is explained.",
    whyItMatters: "Past attempts and future intent cannot be mistaken for Current guidance.",
    expectedResult: "V3, V1→V2→V3, and the Deferred plan remain visibly separate.",
    destination: "/guided/temporal",
  },
  {
    id: "build-context",
    number: 8,
    title: "Build the task-specific Context Package",
    objective: "Build Current context for the customer portal.",
    whatChanges: "Core selects and budgets an ephemeral, dependency-aware package.",
    whyItMatters: "The task receives correct Current knowledge without historical leakage.",
    expectedResult: "V3 and the exact dependency bundle are included; V1/V2 are not Current.",
    destination: "/context",
  },
  {
    id: "verify-mcp",
    number: 9,
    title: "Verify MCP parity",
    objective: "Run the real loxora_get_context stdio proof.",
    whatChanges: "Only operational proof metadata changes.",
    whyItMatters: "The UI and agent surface demonstrably use the same Core operation.",
    expectedResult: "Revisions, Evidence, paths, budget, and warnings match exactly.",
    destination: "/proof",
  },
]);

export interface DemoResultReceipt {
  readonly fixtureVersion: string;
  readonly actionId: DemoActionId;
  readonly stage: DemoStage;
  readonly title: string;
  readonly message: string;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly artifactIds: readonly string[];
  readonly tone: "Success" | "Warning";
}

export interface TemporalReviewReceipt {
  readonly fixtureVersion: string;
  readonly projectId: string;
  readonly nodeId: string;
  readonly revisionIds: readonly [string, string, string];
  readonly plannedKnowledgeId: string;
  readonly reviewedAt: string;
}

export interface ContextNarrative {
  readonly task: string;
  readonly summary: string;
  readonly currentKnowledge: string;
  readonly affectedProjects: readonly string[];
  readonly dependency: string;
  readonly assessment: string;
  readonly historicalExclusion: string;
}

export interface TemporalReviewTarget {
  readonly historyProjectId: string;
  readonly historyNodeId: string;
  readonly plannedProjectId: string;
  readonly plannedNodeId: string;
}

export interface GuidedDemoState {
  readonly canonicalStage: DemoStage;
  readonly currentStepId: string;
  readonly currentPhase: GuidedPhaseDefinition;
  readonly completedStepIds: readonly string[];
  readonly availableStepIds: readonly string[];
  readonly state: "Active" | "Interrupted" | "Complete";
  readonly progressDetail: string;
  readonly primaryAction: DemoAction;
  readonly secondaryAction: DemoAction | null;
  readonly availableActions: readonly DemoAction[];
  readonly interruption: string | null;
  readonly contextReady: boolean;
  readonly temporalReviewComplete: boolean;
  readonly temporalReviewTarget: TemporalReviewTarget;
  readonly contextNarrative: ContextNarrative;
  readonly parityPassed: boolean;
  readonly lastResult: DemoResultReceipt | null;
}

export interface RuntimeState {
  fixtureVersion: string;
  artifactIds: Record<string, string>;
  lastAction: string;
  parity: { passed: boolean; fingerprint: string | null } | null;
  lastResult?: DemoResultReceipt | null;
  temporalReview?: TemporalReviewReceipt | null;
}
