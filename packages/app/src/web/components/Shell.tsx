import { type ReactNode, useId } from "react";
import { NavLink } from "react-router-dom";
import { usePolling } from "../api.js";
import { useLabels, useLanguage } from "../i18n.js";
import { LABELS, LANGUAGES } from "../labels.js";
import type { WorkspaceInfo } from "../types.js";

/**
 * Stable shell (RFC-010, section 3). Only implemented sections appear in the navigation,
 * so there are no dead ends; Station, Crew, Chat, Memory, and Settings follow later.
 */
export function Shell({ children }: { children: ReactNode }) {
  const workspace = usePolling<WorkspaceInfo>("/api/workspace", 30000);
  const mainId = useId();
  const t = useLabels();
  const { language, setLanguage } = useLanguage();
  return (
    <div className="shell">
      <a className="skip-link" href={`#${mainId}`}>
        {t.shell.skipLink}
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>LOXORA</strong>
            <small>Local · Knowledge · Crew</small>
          </span>
        </div>
        <nav aria-label={t.shell.sections} className="sections">
          <NavLink to="/missions" className="section">
            {t.shell.missions}
          </NavLink>
        </nav>
        <div className="topbar-status">
          {workspace.data ? (
            <>
              <span className="workspace-name" title={t.shell.workspace}>
                {workspace.data.name}
              </span>
              <span className="badge badge-neutral" title={t.shell.actorTitle}>
                {workspace.data.actor ? t.shell.actor(workspace.data.actor) : t.shell.readOnly}
              </span>
            </>
          ) : null}
          <fieldset className="language-switch">
            <legend className="visually-hidden">{t.shell.language}</legend>
            {LANGUAGES.map((option) => (
              <button
                key={option}
                type="button"
                lang={option}
                title={LABELS[option].languageName}
                aria-pressed={language === option}
                onClick={() => setLanguage(option)}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </fieldset>
        </div>
      </header>
      <div id={mainId} className="content">
        {children}
      </div>
    </div>
  );
}
