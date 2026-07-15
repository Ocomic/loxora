import { post } from "../api.js";
import { useApi } from "../hooks/useApi.js";
interface InboxItem {
  kind: string;
  id: string;
  createdAt: string;
  proposal?: {
    kind: string;
    proposedNodeTitle: string;
    proposedContent: string;
    proposerId: string;
  } | null;
  relationshipProposal?: {
    reason: string;
    source: { revisionId: string };
    target: { revisionId: string };
  } | null;
  evidence: { summary: string }[];
}
export function ReviewScreen() {
  const { data, error, reload } = useApi<InboxItem[]>("/api/review-inbox");
  const decide = async (item: InboxItem, decision: "Accepted" | "Rejected") => {
    const relation = item.kind === "CrossProjectRelationshipProposal";
    await post(`/api/reviews/${relation ? "relationship" : "knowledge"}/${item.id}`, {
      decision,
      reviewerId: "Ocomic",
      reason: decision === "Accepted" ? "Evidence supports acceptance" : "Rejected during demo",
    });
    await reload();
  };
  return (
    <>
      <h1>Review Inbox</h1>
      <p>Only submitted, persisted proposals are shown. Acceptance creates immutable records.</p>
      {error ? <p role="alert">{error}</p> : null}
      <section className="stack">
        {data?.map((item) => (
          <article className="card" key={item.id}>
            <div className="row">
              <span className="pill">{item.kind}</span>
              <span className="mono">{item.id}</span>
            </div>
            <h2>{item.proposal?.proposedNodeTitle ?? "Token Parser DependsOn Token Format"}</h2>
            <p>{item.proposal?.proposedContent ?? item.relationshipProposal?.reason}</p>
            <ul>
              {item.evidence.map((entry) => (
                <li key={entry.summary}>{entry.summary}</li>
              ))}
            </ul>
            <div className="actions">
              <button type="button" onClick={() => void decide(item, "Accepted")}>
                Accept
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void decide(item, "Rejected")}
              >
                Reject
              </button>
            </div>
          </article>
        ))}
        {data?.length === 0 ? (
          <p className="empty">No submitted proposals. Continue with the next available action.</p>
        ) : null}
      </section>
    </>
  );
}
