import { Link, useParams, useSearchParams } from "react-router-dom";
import { usePolling } from "../api.js";
import { FILTER_LABELS, relativeTime } from "../labels.js";
import type { MissionFilter, MissionList, MissionSummary } from "../types.js";
import { MissionDetailView } from "./MissionDetailView.js";
import { StatusBadge } from "./StatusBadge.js";

const FILTERS: readonly MissionFilter[] = [
  "all",
  "running",
  "limit",
  "input",
  "completed",
  "failed",
];
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function MissionOverview() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const filter = (params.get("filter") ?? "all") as MissionFilter;
  const all = usePolling<MissionList>("/api/missions");
  const filtered = usePolling<MissionList>(`/api/missions?filter=${filter}`);
  if (all.error) return <Unavailable message={all.error.message} />;
  const missions = all.data?.missions ?? [];
  const active = missions.filter((mission) => !TERMINAL.has(mission.state));
  const recent = missions
    .filter((mission) => TERMINAL.has(mission.state))
    .slice()
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, 5);
  return (
    <div className="missions-layout">
      <aside className="sidebar" aria-label="Missionen">
        <h1 className="sidebar-title">Missionen</h1>
        <p className="hint">
          Neue Mission: <code>loxora mission create</code>
        </p>
        <nav aria-label="Statusfilter">
          <ul className="filters">
            {FILTERS.map((name) => (
              <li key={name}>
                <Link
                  to={`/missions?filter=${name}`}
                  className={`filter filter-${name}${filter === name && !id ? " active" : ""}`}
                  aria-current={filter === name && !id ? "page" : undefined}
                >
                  <span>{FILTER_LABELS[name]}</span>
                  <span className="count">{all.data?.counts[name] ?? "–"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <MissionGroup title="Aktive Missionen" missions={active} selected={id} />
        <MissionGroup title="Letzte Missionen" missions={recent} selected={id} />
      </aside>
      <main className="main">
        {id ? (
          <MissionDetailView id={id} />
        ) : (
          <MissionTable title={FILTER_LABELS[filter]} list={filtered.data} />
        )}
      </main>
    </div>
  );
}

function MissionGroup({
  title,
  missions,
  selected,
}: {
  title: string;
  missions: readonly MissionSummary[];
  selected: string | undefined;
}) {
  if (missions.length === 0) return null;
  return (
    <section className="mission-group">
      <h2>{title}</h2>
      <ul>
        {missions.map((mission) => (
          <li key={mission.id}>
            <Link
              to={`/missions/${mission.id}`}
              className={`mission-chip${selected === mission.id ? " active" : ""}`}
            >
              <span className="chip-title">{mission.title}</span>
              <span className="chip-meta">
                <span className="tag">{mission.project.name}</span>
                <StatusBadge state={mission.state} waitReason={mission.waitReason} />
                <span className="muted">{relativeTime(mission.lastActivityAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MissionTable({ title, list }: { title: string; list: MissionList | null }) {
  if (!list) return <p className="muted">Lade Missionen …</p>;
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>{title}</h2>
        <span className="muted">Sortiert nach Bedarf an Aufmerksamkeit</span>
      </header>
      {list.missions.length === 0 ? (
        <p className="empty">
          Keine Missionen. Agenten erfassen ihre Arbeit mit <code>loxora mission create</code>.
        </p>
      ) : (
        <ul className="mission-rows">
          {list.missions.map((mission) => (
            <li key={mission.id}>
              <Link to={`/missions/${mission.id}`} className="mission-row">
                <span className="row-main">
                  <strong>{mission.title}</strong>
                  <span className="row-tags">
                    <span className="tag">{mission.project.name}</span>
                    {mission.workerRole ? (
                      <span className="tag tag-role">{mission.workerRole}</span>
                    ) : null}
                  </span>
                  {mission.question ? (
                    <span className="row-question">Braucht dich: {mission.question}</span>
                  ) : mission.state === "running" && mission.currentActivity ? (
                    <span className="muted">{mission.currentActivity}</span>
                  ) : null}
                </span>
                <StatusBadge state={mission.state} waitReason={mission.waitReason} />
                <span className="muted row-time">{relativeTime(mission.lastActivityAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Unavailable({ message }: { message: string }) {
  return (
    <section className="panel panel-warning unavailable" role="alert">
      <h1>Workspace nicht verfügbar</h1>
      <p>{message}</p>
    </section>
  );
}
