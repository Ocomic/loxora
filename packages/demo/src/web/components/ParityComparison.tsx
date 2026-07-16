import { TechnicalDetails } from "./TechnicalDetails.js";

interface Proof {
  readonly passed: boolean;
  readonly uiFingerprint?: string;
  readonly mcpFingerprint?: string;
  readonly fingerprint?: string;
  readonly tool?: string;
  readonly comparedAt?: string;
  readonly comparisons?: Readonly<Record<string, boolean>>;
  readonly message?: string;
}

export function ParityComparison({ proof }: { proof: Proof }) {
  const comparisons = proof.comparisons ?? {};
  return (
    <section className={`parity-result ${proof.passed ? "success" : "warning"}`}>
      <p className="eyebrow">Real read-only stdio proof</p>
      <h2>{proof.passed ? "UI and MCP context match exactly" : "MCP proof is not complete"}</h2>
      <div className="fingerprint-compare">
        <div>
          <span>UI Context Package</span>
          <code>{short(proof.uiFingerprint ?? proof.fingerprint)}</code>
        </div>
        <div aria-hidden="true">{proof.passed ? "=" : "≠"}</div>
        <div>
          <span>MCP Context Package</span>
          <code>{short(proof.mcpFingerprint ?? proof.fingerprint)}</code>
        </div>
      </div>
      {Object.keys(comparisons).length ? (
        <dl className="comparison-list">
          {Object.entries(comparisons).map(([key, match]) => (
            <div key={key}>
              <dt>{humanCategory(key)}</dt>
              <dd className={match ? "match" : "mismatch"}>{match ? "✓ Match" : "✕ Mismatch"}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>{proof.message ?? "Run the proof command, then refresh this view."}</p>
      )}
      <p>
        <strong>Tool:</strong> <code>{proof.tool ?? "loxora_get_context"}</code>
      </p>
      {proof.comparedAt ? (
        <p>
          <strong>Compared:</strong> {new Date(proof.comparedAt).toLocaleString()}
        </p>
      ) : null}
      <TechnicalDetails>
        <pre>{JSON.stringify(proof, null, 2)}</pre>
      </TechnicalDetails>
    </section>
  );
}
const short = (value?: string) =>
  value ? `sha256: ${value.slice(0, 12)}…${value.slice(-8)}` : "Not available";
const humanCategory = (key: string) =>
  (
    ({
      fingerprint: "Fingerprint",
      entries: "Ordered entries",
      revisions: "Revisions",
      evidence: "Evidence",
      dependencyPaths: "Dependency paths",
      impactAssessments: "Impact assessments",
      budget: "Budget result",
      warnings: "Warnings",
    }) as Record<string, string>
  )[key] ?? key;
