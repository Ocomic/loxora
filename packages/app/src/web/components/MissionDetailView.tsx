import { useId } from "react";
import { Link } from "react-router-dom";
import { usePolling } from "../api.js";
import { useLabels } from "../i18n.js";
import {
  clockTime,
  dateTime,
  eventLabel,
  type Labels,
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
  const t = useLabels();
  const detail = usePolling<MissionDetail>(`/api/missions/${encodeURIComponent(id)}`);
  const events = usePolling<MissionEvent[]>(`/api/missions/${encodeURIComponent(id)}/events`);
  if (detail.error) {
    return (
      <section className="panel" role="alert">
        <h1>{t.detail.notFound}</h1>
        <p>{detail.error.message}</p>
        <Link to="/missions">{t.detail.back}</Link>
      </section>
    );
  }
  const mission = detail.data;
  if (!mission) return <p className="muted">{t.detail.loading}</p>;
  return (
    <article className="detail" aria-labelledby={titleId}>
      <nav className="breadcrumb" aria-label={t.detail.breadcrumb}>
        <Link to="/missions">{t.shell.missions}</Link> <span aria-hidden="true">›</span>{" "}
        {mission.title}
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
                <dt>{t.detail.started}</dt>
                <dd>{dateTime(t, mission.startedAt)}</dd>
              </div>
            ) : (
              <div>
                <dt>{t.detail.created}</dt>
                <dd>{dateTime(t, mission.createdAt)}</dd>
              </div>
            )}
            <div>
              <dt>{t.detail.lastActivity}</dt>
              <dd>{relativeTime(t, mission.lastActivityAt)}</dd>
            </div>
          </dl>
        </div>
      </header>
      <div className="detail-grid">
        <div className="detail-main">
          <StatePanel mission={mission} />
          <Timeline events={events.data ?? []} live={events.updatedAt !== null} />
        </div>
        <aside className="detail-side" aria-label={t.detail.projectAndContext}>
          <ContextPanel mission={mission} />
          <TechnicalDetails mission={mission} />
        </aside>
      </div>
    </article>
  );
}

function StatePanel({ mission }: { mission: MissionDetail }) {
  const t = useLabels();
  if (mission.state === "running") {
    return (
      <section className="panel">
        <h2>{t.detail.currentState}</h2>
        <p className="current-activity">{mission.currentActivity ?? t.detail.noActivity}</p>
        <p className="muted">{t.detail.reportedBy(mission.latestActor)}</p>
      </section>
    );
  }
  if (mission.state === "waiting" && mission.waitReason === "provider_limit") {
    return (
      <section className="panel panel-limit">
        <h2>
          {mission.limitedCapability ? `${mission.limitedCapability}: ` : ""}
          {t.detail.limitReached}
        </h2>
        <p>
          {t.detail.notFailed} {mission.waitDetail}
        </p>
        {mission.expectedResumeAt ? (
          <p className="next-window">
            {t.detail.nextWindow} <strong>{dateTime(t, mission.expectedResumeAt)}</strong> (
            {untilTime(t, mission.expectedResumeAt)})
          </p>
        ) : null}
        <p className="muted">
          {t.detail.noAutoResume}{" "}
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
          {answered ? t.detail.answerReceived : t.detail.decisionRequired} ·{" "}
          {waitReasonLabel(t, request.waitReason)}
        </h2>
        <p className="question">{request.question}</p>
        <p>
          <span className="muted">{t.detail.why} </span>
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
            {t.detail.answeredBy} <strong>{request.responderId}</strong>: {request.response}
            {request.decision
              ? ` (${request.decision === "approve" ? t.detail.approved : t.detail.rejected})`
              : ""}
            . {t.detail.waitsForResume}
          </p>
        ) : (
          <p className="muted">
            {t.detail.answerWith}{" "}
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
        <h2>{outcome.kind === "Completed" ? t.detail.completed : t.detail.failed}</h2>
        <p className="question">{outcome.summary}</p>
        <OutcomeList title={t.detail.outputs} values={outcome.outputs} />
        <OutcomeList title={t.detail.validations} values={outcome.validations} />
        <OutcomeList title={t.detail.decisions} values={outcome.decisions} />
        {outcome.proposals.length > 0 ? (
          <div>
            <h3>{t.detail.proposals}</h3>
            <ul className="plain">
              {outcome.proposals.map((proposal) => (
                <li key={proposal.proposalId}>
                  {t.detail.proposal} {proposal.proposalId.slice(0, 8)} —{" "}
                  <span className={`proposal-${proposal.status.toLowerCase()}`}>
                    {proposalStatusLabel(t, proposal.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {outcome.logReferences.length > 0 ? (
          <div>
            <h3>{t.detail.logs}</h3>
            <ul className="plain">
              {outcome.logReferences.map((log) => (
                <li key={`${log.kind}:${log.locator}`}>
                  <code>{log.locator}</code>
                  {log.portable ? "" : ` ${t.detail.notPortable}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="muted">{t.detail.notAccepted}</p>
      </section>
    );
  }
  return (
    <section className="panel">
      <h2>{t.states[mission.state]}</h2>
      <p className="muted">
        {mission.state === "queued"
          ? t.detail.queuedText
          : mission.state === "paused"
            ? t.detail.pausedText
            : t.detail.cancelledText}
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
  const t = useLabels();
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>{t.detail.timeline}</h2>
        {live ? (
          <span className="live" title={t.detail.liveTitle}>
            <span className="dot" aria-hidden="true" /> {t.detail.live}
          </span>
        ) : null}
      </header>
      <ol className="timeline">
        {[...events].reverse().map((event) => (
          <li key={event.id} className={`event event-${event.newState}`}>
            <time dateTime={event.occurredAt}>{clockTime(t, event.occurredAt)}</time>
            <span className="event-dot" aria-hidden="true" />
            <span className="event-body">
              <strong>
                {eventLabel(t, event.type)}
                {event.type === "Waiting" && event.waitReason
                  ? ` · ${waitReasonLabel(t, event.waitReason)}`
                  : ""}
              </strong>
              <span className="muted">{eventText(t, event)}</span>
            </span>
            <span className="muted event-time">{relativeTime(t, event.occurredAt)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function eventText(t: Labels, event: MissionEvent): string {
  const payload = event.payload;
  const text =
    (typeof payload.activity === "string" && payload.activity) ||
    (typeof payload.question === "string" && payload.question) ||
    (typeof payload.response === "string" && `${t.detail.answer} ${payload.response}`) ||
    (typeof payload.detail === "string" && payload.detail) ||
    event.reason ||
    "";
  return `${text}${text ? " · " : ""}${event.actorId}`;
}

function ContextPanel({ mission }: { mission: MissionDetail }) {
  const t = useLabels();
  const { references } = mission;
  return (
    <section className="panel">
      <h2>{t.detail.projectAndContext}</h2>
      <dl className="facts facts-stacked">
        <div>
          <dt>{t.detail.project}</dt>
          <dd>{mission.project.name}</dd>
        </div>
        {references.projects.length > 0 ? (
          <div>
            <dt>{t.detail.otherProjects}</dt>
            <dd>{references.projects.map((project) => project.name).join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      {references.nodes.length > 0 ? (
        <>
          <h3>{t.detail.nodes}</h3>
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
          <h3>{t.detail.plans}</h3>
          <ul className="plain">
            {references.plans.map((plan) => (
              <li key={plan.planId}>
                {plan.title}
                {plan.status ? (
                  <span className="muted"> · {planStatusLabel(t, plan.status)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {references.nodes.length === 0 && references.plans.length === 0 ? (
        <p className="muted">{t.detail.noReferences}</p>
      ) : null}
    </section>
  );
}

function TechnicalDetails({ mission }: { mission: MissionDetail }) {
  const t = useLabels();
  return (
    <details className="panel technical">
      <summary>{t.detail.technical}</summary>
      <dl className="facts facts-stacked">
        <div>
          <dt>{t.detail.missionId}</dt>
          <dd>
            <code>{mission.id}</code>
          </dd>
        </div>
        <div>
          <dt>{t.detail.state}</dt>
          <dd>
            <code>
              {mission.state}
              {mission.waitReason ? ` / ${mission.waitReason}` : ""}
            </code>
          </dd>
        </div>
        <div>
          <dt>{t.detail.events}</dt>
          <dd>{mission.sequence}</dd>
        </div>
        <div>
          <dt>{t.detail.createdBy}</dt>
          <dd>{mission.createdBy}</dd>
        </div>
        {mission.predecessorMissionId ? (
          <div>
            <dt>{t.detail.predecessor}</dt>
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
