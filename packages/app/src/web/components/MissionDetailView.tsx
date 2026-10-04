import { useId } from "react";
import { Link } from "react-router-dom";
import { usePolling } from "../api.js";
import {
  clockTime,
  dateTime,
  EVENT_LABELS,
  planStatusLabel,
  proposalStatusLabel,
  relativeTime,
  untilTime,
  waitReasonLabel,
} from "../labels.js";
import type { MissionDetail, MissionEvent } from "../types.js";
import { StatusBadge } from "./StatusBadge.js";

/**
 * Mission Detail (RFC-010, section 5). Every value comes from the read API; design
 * elements without a data source (steps, crew, chat, costs, actions) are not rendered.
 */
export function MissionDetailView({ id }: { id: string }) {
  const titleId = useId();
  const detail = usePolling<MissionDetail>(`/api/missions/${encodeURIComponent(id)}`);
  const events = usePolling<MissionEvent[]>(`/api/missions/${encodeURIComponent(id)}/events`);
  if (detail.error) {
    return (
      <section className="panel" role="alert">
        <h1>Mission nicht gefunden</h1>
        <p>{detail.error.message}</p>
        <Link to="/missions">Zurück zu den Missionen</Link>
      </section>
    );
  }
  const mission = detail.data;
  if (!mission) return <p className="muted">Lade Mission …</p>;
  return (
    <article className="detail" aria-labelledby={titleId}>
      <nav className="breadcrumb" aria-label="Pfad">
        <Link to="/missions">Missionen</Link> <span aria-hidden="true">›</span> {mission.title}
      </nav>
      <header className="detail-header">
        <div>
          <h1 id={titleId}>{mission.title}</h1>
          <div className="row-tags">
            <span className="tag">{mission.project.name}</span>
            {mission.workerRole ? <span className="tag tag-role">{mission.workerRole}</span> : null}
          </div>
          <p className="goal">{mission.goal}</p>
        </div>
        <div className="detail-status">
          <StatusBadge state={mission.state} waitReason={mission.waitReason} large />
          <dl className="facts">
            {mission.startedAt ? (
              <div>
                <dt>Gestartet</dt>
                <dd>{dateTime(mission.startedAt)}</dd>
              </div>
            ) : (
              <div>
                <dt>Erstellt</dt>
                <dd>{dateTime(mission.createdAt)}</dd>
              </div>
            )}
            <div>
              <dt>Letzte Aktivität</dt>
              <dd>{relativeTime(mission.lastActivityAt)}</dd>
            </div>
          </dl>
        </div>
      </header>
      <div className="detail-grid">
        <div className="detail-main">
          <StatePanel mission={mission} />
          <Timeline events={events.data ?? []} live={events.updatedAt !== null} />
        </div>
        <aside className="detail-side" aria-label="Projekt und Kontext">
          <ContextPanel mission={mission} />
          <TechnicalDetails mission={mission} />
        </aside>
      </div>
    </article>
  );
}

function StatePanel({ mission }: { mission: MissionDetail }) {
  if (mission.state === "running") {
    return (
      <section className="panel">
        <h2>Aktueller Stand</h2>
        <p className="current-activity">
          {mission.currentActivity ?? "Der Agent hat noch keine Tätigkeit gemeldet."}
        </p>
        <p className="muted">Gemeldet von {mission.latestActor}</p>
      </section>
    );
  }
  if (mission.state === "waiting" && mission.waitReason === "provider_limit") {
    return (
      <section className="panel panel-limit">
        <h2>
          {mission.limitedCapability ? `${mission.limitedCapability}: ` : ""}Limit erreicht –
          Mission sicher pausiert
        </h2>
        <p>Die Mission ist nicht fehlgeschlagen. {mission.waitDetail}</p>
        {mission.expectedResumeAt ? (
          <p className="next-window">
            Nächstes Fenster: <strong>{dateTime(mission.expectedResumeAt)}</strong> (
            {untilTime(mission.expectedResumeAt)})
          </p>
        ) : null}
        <p className="muted">
          Nichts wird automatisch fortgesetzt. Fortsetzen mit{" "}
          <code>loxora mission resume --mission {mission.id.slice(0, 8)}</code>
        </p>
      </section>
    );
  }
  if (mission.state === "waiting" && mission.attentionRequest) {
    const request = mission.attentionRequest;
    const answered = request.answeredAt !== null;
    return (
      <section className={`panel ${answered ? "panel-answered" : "panel-input"}`}>
        <h2>
          {answered ? "Antwort erhalten" : "Entscheidung erforderlich"} ·{" "}
          {waitReasonLabel(request.waitReason)}
        </h2>
        <p className="question">{request.question}</p>
        <p>
          <span className="muted">Warum: </span>
          {request.rationale}
        </p>
        {request.options.length > 0 ? (
          <ol className="options">
            {request.options.map((option) => (
              <li key={option.option} className="option">
                <strong>{option.option}</strong>
                {option.consequence ? <span>{option.consequence}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
        {answered ? (
          <p>
            Beantwortet von <strong>{request.responderId}</strong>: {request.response}
            {request.decision
              ? ` (${request.decision === "approve" ? "freigegeben" : "abgelehnt"})`
              : ""}
            . Die Mission wartet auf das Fortsetzen.
          </p>
        ) : (
          <p className="muted">
            Antworten mit{" "}
            <code>
              loxora mission answer --mission {mission.id.slice(0, 8)} --response "…"
              {request.waitReason === "needs_approval" ? " --decision approve|reject" : ""}
            </code>
          </p>
        )}
      </section>
    );
  }
  if (mission.outcome) {
    const outcome = mission.outcome;
    return (
      <section className={`panel ${outcome.kind === "Completed" ? "panel-done" : "panel-failed"}`}>
        <h2>{outcome.kind === "Completed" ? "Mission abgeschlossen" : "Mission fehlgeschlagen"}</h2>
        <p className="question">{outcome.summary}</p>
        <OutcomeList title="Ergebnisse" values={outcome.outputs} />
        <OutcomeList title="Prüfungen" values={outcome.validations} />
        <OutcomeList title="Entscheidungen" values={outcome.decisions} />
        {outcome.proposals.length > 0 ? (
          <div>
            <h3>Wissensvorschläge</h3>
            <ul className="plain">
              {outcome.proposals.map((proposal) => (
                <li key={proposal.proposalId}>
                  Vorschlag {proposal.proposalId.slice(0, 8)} —{" "}
                  <span className={`proposal-${proposal.status.toLowerCase()}`}>
                    {proposalStatusLabel(proposal.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {outcome.logReferences.length > 0 ? (
          <div>
            <h3>Logs</h3>
            <ul className="plain">
              {outcome.logReferences.map((log) => (
                <li key={`${log.kind}:${log.locator}`}>
                  <code>{log.locator}</code>
                  {log.portable ? "" : " (nicht portabel)"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="muted">
          Ein Abschluss ist noch kein angenommenes Wissen; Vorschläge laufen durch das Review.
        </p>
      </section>
    );
  }
  return (
    <section className="panel">
      <h2>
        {mission.state === "queued"
          ? "Geplant"
          : mission.state === "paused"
            ? "Pausiert"
            : "Abgebrochen"}
      </h2>
      <p className="muted">
        {mission.state === "queued"
          ? "Die Mission wurde erfasst und wartet auf den Start."
          : mission.state === "paused"
            ? "Ein Mensch hat die Mission bewusst angehalten."
            : "Die Mission wurde abgebrochen."}
      </p>
    </section>
  );
}

function OutcomeList({ title, values }: { title: string; values: readonly string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul className="plain">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function Timeline({ events, live }: { events: readonly MissionEvent[]; live: boolean }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Timeline</h2>
        {live ? (
          <span className="live" title="Aktualisiert alle 5 Sekunden">
            <span className="dot" aria-hidden="true" /> Live
          </span>
        ) : null}
      </header>
      <ol className="timeline">
        {[...events].reverse().map((event) => (
          <li key={event.id} className={`event event-${event.newState}`}>
            <time dateTime={event.occurredAt}>{clockTime(event.occurredAt)}</time>
            <span className="event-dot" aria-hidden="true" />
            <span className="event-body">
              <strong>
                {EVENT_LABELS[event.type] ?? event.type}
                {event.type === "Waiting" && event.waitReason
                  ? ` · ${waitReasonLabel(event.waitReason)}`
                  : ""}
              </strong>
              <span className="muted">{eventText(event)}</span>
            </span>
            <span className="muted event-time">{relativeTime(event.occurredAt)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function eventText(event: MissionEvent): string {
  const payload = event.payload;
  const text =
    (typeof payload.activity === "string" && payload.activity) ||
    (typeof payload.question === "string" && payload.question) ||
    (typeof payload.response === "string" && `Antwort: ${payload.response}`) ||
    (typeof payload.detail === "string" && payload.detail) ||
    event.reason ||
    "";
  return `${text}${text ? " · " : ""}${event.actorId}`;
}

function ContextPanel({ mission }: { mission: MissionDetail }) {
  const { references } = mission;
  return (
    <section className="panel">
      <h2>Projekt &amp; Kontext</h2>
      <dl className="facts facts-stacked">
        <div>
          <dt>Projekt</dt>
          <dd>{mission.project.name}</dd>
        </div>
        {references.projects.length > 0 ? (
          <div>
            <dt>Weitere Projekte</dt>
            <dd>{references.projects.map((project) => project.name).join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      {references.nodes.length > 0 ? (
        <>
          <h3>Wissensknoten</h3>
          <ul className="plain">
            {references.nodes.map((node) => (
              <li key={node.nodeId}>
                {node.key ? <span className="tag tag-key">{node.key}</span> : null} {node.title}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {references.plans.length > 0 ? (
        <>
          <h3>Pläne</h3>
          <ul className="plain">
            {references.plans.map((plan) => (
              <li key={plan.planId}>
                {plan.title}
                {plan.status ? (
                  <span className="muted"> · {planStatusLabel(plan.status)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {references.nodes.length === 0 && references.plans.length === 0 ? (
        <p className="muted">Keine verknüpften Knoten oder Pläne.</p>
      ) : null}
    </section>
  );
}

function TechnicalDetails({ mission }: { mission: MissionDetail }) {
  return (
    <details className="panel technical">
      <summary>Technische Details</summary>
      <dl className="facts facts-stacked">
        <div>
          <dt>Mission-ID</dt>
          <dd>
            <code>{mission.id}</code>
          </dd>
        </div>
        <div>
          <dt>Zustand</dt>
          <dd>
            <code>
              {mission.state}
              {mission.waitReason ? ` / ${mission.waitReason}` : ""}
            </code>
          </dd>
        </div>
        <div>
          <dt>Ereignisse</dt>
          <dd>{mission.sequence}</dd>
        </div>
        <div>
          <dt>Erstellt von</dt>
          <dd>{mission.createdBy}</dd>
        </div>
        {mission.predecessorMissionId ? (
          <div>
            <dt>Vorgänger</dt>
            <dd>
              <Link to={`/missions/${mission.predecessorMissionId}`}>
                {mission.predecessorMissionId.slice(0, 8)}
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}
