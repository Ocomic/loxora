import { Link, useParams, useSearchParams } from "react-router-dom";
import { usePolling } from "../api.js";
import { useLabels } from "../i18n.js";
import { relativeTime } from "../labels.js";
import type { MissionFilter, MissionList, MissionSummary } from "../types.js";
import { useFirstMission } from "./FirstMission.js";
import { MissionDetailView } from "./MissionDetailView.js";
import { StatusBadge } from "./StatusBadge.js";
import { useXora } from "./XoraBar.js";

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
  const t = useLabels();
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
      <aside className="sidebar" aria-label={t.shell.missions}>
        <h1 className="sidebar-title">{t.shell.missions}</h1>
        <p className="hint">
          {t.overview.newMission} <code>loxora mission create</code>
        </p>
        <nav aria-label={t.overview.statusFilter}>
          <ul className="filters">
            {FILTERS.map((name) => (
              <li key={name}>
                <Link
                  to={`/missions?filter=${name}`}
                  className={`filter filter-${name}${filter === name && !id ? " active" : ""}`}
                  aria-current={filter === name && !id ? "page" : undefined}
                >
                  <span>{t.filters[name]}</span>
                  <span className="count">{all.data?.counts[name] ?? "–"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <MissionGroup title={t.overview.active} missions={active} selected={id} />
        <MissionGroup title={t.overview.recent} missions={recent} selected={id} />
      </aside>
      <main className="main">
        {id ? (
          <MissionDetailView id={id} />
        ) : (
          <MissionTable
            title={t.filters[filter] ?? t.filters.all}
            list={filtered.data}
            unfiltered={filter === "all"}
          />
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
  const t = useLabels();
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
                <span className="muted">{relativeTime(t, mission.lastActivityAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MissionTable({
  title,
  list,
  unfiltered,
}: {
  title: string;
  list: MissionList | null;
  /** The first Mission is offered only when there are no Missions at all. */
  unfiltered: boolean;
}) {
  const t = useLabels();
  const xora = useXora();
  const firstMission = useFirstMission();
  if (!list) return <p className="muted">{t.overview.loading}</p>;
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>{title}</h2>
        <span className="muted">{t.overview.sortedBy}</span>
      </header>
      {list.missions.length === 0 && unfiltered && firstMission.steps?.pending ? (
        <div className="empty first-mission-offer">
          <p>{t.firstSteps.offer}</p>
          <div className="action-row">
            <Link className="button" to="/first-steps">
              {t.firstSteps.continue}
            </Link>
            <button type="button" className="button button-quiet" onClick={firstMission.dismiss}>
              {t.firstSteps.dismiss}
            </button>
          </div>
        </div>
      ) : list.missions.length === 0 ? (
        <div className="empty">
          <p>{t.overview.empty}</p>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => xora.ask(t.xora.askMissions, "missions")}
          >
            {t.xora.askMissions}
          </button>
        </div>
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
                    <span className="row-question">
                      {t.overview.needsYou} {mission.question}
                    </span>
                  ) : mission.state === "running" && mission.currentActivity ? (
                    <span className="muted">{mission.currentActivity}</span>
                  ) : null}
                </span>
                <StatusBadge state={mission.state} waitReason={mission.waitReason} />
                <span className="muted row-time">{relativeTime(t, mission.lastActivityAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Unavailable({ message }: { message: string }) {
  const t = useLabels();
  return (
    <section className="panel panel-warning unavailable" role="alert">
      <h1>{t.overview.unavailable}</h1>
      <p>{message}</p>
    </section>
  );
}
