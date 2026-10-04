import { type ReactNode, useId } from "react";
import { NavLink } from "react-router-dom";
import { usePolling } from "../api.js";
import type { WorkspaceInfo } from "../types.js";

/**
 * Stable shell (RFC-010, section 3). Only implemented sections appear in the navigation,
 * so there are no dead ends; Station, Crew, Chat, Memory, and Settings follow later.
 */
export function Shell({ children }: { children: ReactNode }) {
  const workspace = usePolling<WorkspaceInfo>("/api/workspace", 30000);
  const mainId = useId();
  return (
    <div className="shell">
      <a className="skip-link" href={`#${mainId}`}>
        Zum Inhalt springen
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>LOXORA</strong>
            <small>Local · Knowledge · Crew</small>
          </span>
        </div>
        <nav aria-label="Bereiche" className="sections">
          <NavLink to="/missions" className="section">
            Missionen
          </NavLink>
        </nav>
        <div className="topbar-status">
          {workspace.data ? (
            <>
              <span className="workspace-name" title="Workspace">
                {workspace.data.name}
              </span>
              <span
                className="badge badge-neutral"
                title="Schreiben in der UI braucht einen konfigurierten Akteur (RFC-010, Abschnitt 9)"
              >
                {workspace.data.actor ? `Akteur: ${workspace.data.actor}` : "Nur lesen"}
              </span>
            </>
          ) : null}
        </div>
      </header>
      <div id={mainId} className="content">
        {children}
      </div>
    </div>
  );
}
