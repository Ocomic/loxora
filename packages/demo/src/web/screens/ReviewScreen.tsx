import { useState } from "react";
import { post } from "../api.js";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncState.js";
import { EvidenceSummary } from "../components/EvidenceSummary.js";
import { TechnicalDetails } from "../components/TechnicalDetails.js";
import { TemporalBadge } from "../components/TemporalBadge.js";
import { useApi } from "../hooks/useApi.js";
import { useDemoState } from "../components/DemoState.js";

interface InboxItem {
  readonly kind: string;
  readonly id: string;
  readonly createdAt: string;
  readonly allowedDecisions: readonly ("Accepted" | "Rejected")[];
  readonly paths: readonly { readonly segments: readonly { readonly label: string }[] }[];
  readonly proposal?: {
    readonly kind: string;
    readonly proposedNodeTitle: string;
    readonly proposedContent: string;
    readonly proposerId: string;
    readonly expectedPredecessorRevisionId?: string | null;
    readonly changeReason?: string | null;
    readonly projectId: string;
  } | null;
  readonly relationshipProposal?: {
    readonly reason: string;
    readonly source: { readonly projectId: string; readonly revisionId: string };
    readonly target: { readonly projectId: string; readonly revisionId: string };
  } | null;
  readonly evidence: readonly {
    readonly id: string;
    readonly projectId: string;
    readonly summary: string;
  }[];
}

export function ReviewScreen() {
  const { data, error, reload } = useApi<InboxItem[]>("/api/review-inbox");
  const { refresh, mutationPending, setMutationPending } = useDemoState();
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const decide = async (item: InboxItem, decision: "Accepted" | "Rejected") => {
    if (!item.allowedDecisions.includes(decision) || mutationPending) return;
    try {
      setPending(item.id);
      setMutationPending(true);
      setActionError(null);
      const relation = item.kind === "CrossProjectRelationshipProposal";
      await post(`/api/reviews/${relation ? "relationship" : "knowledge"}/${item.id}`, {
        decision,
        reviewerId: "Ocomic",
        reason: decision === "Accepted" ? "Evidence supports acceptance" : "Rejected during demo",
      });
      await Promise.all([reload(), refresh()]);
    } catch (value) {
      setActionError(value instanceof Error ? value.message : "Review failed");
      await Promise.all([reload(), refresh()]);
    } finally {
      setPending(null);
      setMutationPending(false);
    }
  };
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Review before canon</p>
        <h1>Review Inbox</h1>
        <p>
          Decide what becomes shared project knowledge. Evidence remains visible; technical
          provenance remains inspectable.
        </p>
      </header>
      {error ? <ErrorState message={error} retry={() => void reload()} /> : null}
      {actionError ? (
        <p className="callout error" role="alert">
          {actionError}. Refreshing the Inbox preserves actual Current knowledge.
        </p>
      ) : null}
      {!data && !error ? <LoadingState label="Loading submitted Proposals…" /> : null}
      {data?.length === 0 ? (
        <EmptyState
          title="Review Inbox is clear"
          message="Continue with the next server-provided guided action."
        />
      ) : null}
      <section className="stack review-list">
        {data?.map((item) => (
          <ProposalCard item={item} pending={pending === item.id} decide={decide} key={item.id} />
        ))}
      </section>
    </>
  );
}

function ProposalCard({
  item,
  pending,
  decide,
}: {
  item: InboxItem;
  pending: boolean;
  decide: (item: InboxItem, decision: "Accepted" | "Rejected") => Promise<void>;
}) {
  const { mutationPending } = useDemoState();
  const relation = item.kind === "CrossProjectRelationshipProposal";
  const proposal = item.proposal;
  const kind = relation ? "Relationship" : (proposal?.kind ?? "Knowledge");
  const copy = proposalCopy(kind);
  return (
    <article className="card proposal-card">
      <div className="row">
        <span className="status-badge evidence">{copy.type}</span>
        <TemporalBadge value="Proposed" />
      </div>
      <h2>{proposal?.proposedNodeTitle ?? "Token Parser depends on Token Format"}</h2>
      <p className="proposal-summary">{copy.summary}</p>
      {proposal?.kind === "Successor" ? (
        <div className="change-compare">
          <div>
            <span>Replace</span>
            <strong>customer_id</strong>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <span>With</span>
            <strong>subject_id</strong>
          </div>
        </div>
      ) : null}
      {proposal?.kind === "Restoration" ? (
        <p className="callout success">
          <strong>New V3 Revision:</strong> restores compatible semantics without reactivating V1 or
          deleting V2.
        </p>
      ) : null}
      {relation ? (
        <p className="callout evidence">
          <strong>When accepted:</strong> one immutable DependsOn relationship preserves both
          reviewed endpoint Revisions.
        </p>
      ) : (
        <p className="callout neutral">
          <strong>When accepted:</strong> {copy.result}
        </p>
      )}
      <EvidenceSummary evidence={item.evidence} />
      <div className="actions">
        <button
          className="button primary"
          type="button"
          disabled={pending || mutationPending || !item.allowedDecisions.includes("Accepted")}
          onClick={() => void decide(item, "Accepted")}
        >
          {pending ? "Recording decision…" : "Accept and continue"}
        </button>
        <button
          className="button danger-secondary"
          type="button"
          disabled={pending || mutationPending || !item.allowedDecisions.includes("Rejected")}
          onClick={() => void decide(item, "Rejected")}
        >
          Reject
        </button>
      </div>
      <p className="muted">
        <strong>Rejecting interrupts the guided story.</strong> Current project knowledge remains
        safe and reset restores the prepared path.
      </p>
      <TechnicalDetails>
        <dl className="compact-facts">
          <div>
            <dt>Proposal ID</dt>
            <dd className="mono">{item.id}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{new Date(item.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Proposer</dt>
            <dd>{proposal?.proposerId ?? "portal-maintainer"}</dd>
          </div>
        </dl>
        <pre>{JSON.stringify(item, null, 2)}</pre>
      </TechnicalDetails>
    </article>
  );
}

function proposalCopy(kind: string) {
  const values: Record<string, { type: string; summary: string; result: string }> = {
    Initial: {
      type: "Initial project knowledge",
      summary: "Establish the reviewed V1 understanding for this project.",
      result: "V1 becomes Current with Proposal, Review, Evidence, and Revision provenance.",
    },
    Relationship: {
      type: "Cross-project dependency",
      summary: "Connect the authentication client to the shared token contract.",
      result: "The dependency becomes discoverable from both projects.",
    },
    Successor: {
      type: "Breaking contract change",
      summary: "Replace the provider claim while the consumer still requires the previous claim.",
      result:
        "V2 becomes Current, V1 remains Historical, and the relationship binding becomes Stale.",
    },
    Restoration: {
      type: "Restoration Revision",
      summary: "Restore customer_id compatibility through a new reviewed Revision.",
      result: "V3 becomes Current while V1 and V2 remain preserved in History.",
    },
  };
  return (
    values[kind] ?? {
      type: kind,
      summary: "Review the persisted Proposal and Evidence.",
      result: "The accepted record becomes traceable.",
    }
  );
}
