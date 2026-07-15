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
export interface RuntimeState {
  fixtureVersion: string;
  artifactIds: Record<string, string>;
  lastAction: string;
  parity: { passed: boolean; fingerprint: string | null } | null;
}
