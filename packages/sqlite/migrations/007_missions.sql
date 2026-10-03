-- ADR-005: Missions are execution state, separate from knowledge (RFC-009).
-- Mission rows change only through Core operations; every change appends exactly one
-- Mission Event. Events, references, and outcomes are append-only.

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  owner_project_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  goal TEXT NOT NULL CHECK (length(trim(goal)) > 0),
  state TEXT NOT NULL CHECK (state IN ('queued','running','waiting','paused','completed','failed','cancelled')),
  wait_reason TEXT CHECK (wait_reason IN ('provider_limit','needs_input','needs_approval','needs_permission','needs_manual_action')),
  wait_detail TEXT,
  limited_capability TEXT,
  expected_resume_at TEXT,
  current_activity TEXT,
  worker_role TEXT,
  agent_metadata TEXT,
  predecessor_mission_id TEXT,
  created_by TEXT NOT NULL CHECK (length(trim(created_by)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  UNIQUE (id, owner_project_id),
  FOREIGN KEY (owner_project_id) REFERENCES projects(id),
  FOREIGN KEY (predecessor_mission_id) REFERENCES missions(id),
  CHECK ((state = 'waiting') = (wait_reason IS NOT NULL)),
  CHECK (wait_reason = 'provider_limit' OR (limited_capability IS NULL AND expected_resume_at IS NULL)),
  CHECK (predecessor_mission_id IS NULL OR predecessor_mission_id <> id)
) STRICT;

CREATE INDEX missions_project_state ON missions(owner_project_id, state, updated_at, id);

CREATE TABLE mission_project_references (
  mission_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  PRIMARY KEY (mission_id, project_id),
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;

CREATE TABLE mission_knowledge_references (
  mission_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('Node','PlannedKnowledge')),
  project_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  PRIMARY KEY (mission_id, kind, project_id, target_id),
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;

CREATE TABLE mission_events (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'Created','Started','ActivityReported','Waiting','AttentionAnswered',
    'Resumed','Paused','Cancelled','Completed','Failed')),
  previous_state TEXT CHECK (previous_state IN ('queued','running','waiting','paused','completed','failed','cancelled')),
  new_state TEXT NOT NULL CHECK (new_state IN ('queued','running','waiting','paused','completed','failed','cancelled')),
  wait_reason TEXT CHECK (wait_reason IN ('provider_limit','needs_input','needs_approval','needs_permission','needs_manual_action')),
  actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) > 0),
  occurred_at TEXT NOT NULL,
  reason TEXT,
  payload_json TEXT NOT NULL,
  UNIQUE (mission_id, sequence),
  FOREIGN KEY (mission_id) REFERENCES missions(id)
) STRICT;

CREATE TABLE mission_event_evidence (
  event_id TEXT NOT NULL,
  evidence_project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (event_id, evidence_project_id, evidence_reference_id),
  FOREIGN KEY (event_id) REFERENCES mission_events(id),
  FOREIGN KEY (evidence_reference_id, evidence_project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE TABLE mission_attention_requests (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  wait_reason TEXT NOT NULL CHECK (wait_reason IN ('needs_input','needs_approval','needs_permission','needs_manual_action')),
  question TEXT NOT NULL CHECK (length(trim(question)) > 0),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) > 0),
  options_json TEXT NOT NULL,
  response TEXT,
  decision TEXT CHECK (decision IN ('approve','reject')),
  responder_id TEXT,
  answered_at TEXT,
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  FOREIGN KEY (event_id) REFERENCES mission_events(id),
  CHECK ((answered_at IS NULL) = (response IS NULL)),
  CHECK ((answered_at IS NULL) = (responder_id IS NULL)),
  CHECK (decision IS NULL OR answered_at IS NOT NULL),
  CHECK (wait_reason <> 'needs_approval' OR answered_at IS NULL OR decision IS NOT NULL)
) STRICT;

CREATE TABLE mission_outcomes (
  mission_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('Completed','Failed')),
  summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
  outputs_json TEXT NOT NULL,
  validations_json TEXT NOT NULL,
  decisions_json TEXT NOT NULL,
  recorded_by TEXT NOT NULL CHECK (length(trim(recorded_by)) > 0),
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
) STRICT;

CREATE TABLE mission_outcome_proposals (
  mission_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  PRIMARY KEY (mission_id, proposal_id),
  FOREIGN KEY (mission_id) REFERENCES mission_outcomes(mission_id),
  FOREIGN KEY (proposal_id, project_id) REFERENCES knowledge_proposals(id, project_id)
) STRICT;

CREATE TABLE mission_log_references (
  mission_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 1),
  kind TEXT NOT NULL CHECK (kind IN ('workspace','external')),
  locator TEXT NOT NULL CHECK (length(trim(locator)) > 0),
  PRIMARY KEY (mission_id, position),
  FOREIGN KEY (mission_id) REFERENCES mission_outcomes(mission_id)
) STRICT;

-- Guards: Missions are never deleted; history and outcomes are append-only;
-- an Attention Request is answered at most once.
CREATE TRIGGER missions_no_delete BEFORE DELETE ON missions
BEGIN SELECT RAISE(ABORT, 'Missions are never deleted'); END;
CREATE TRIGGER missions_identity_immutable BEFORE UPDATE ON missions
WHEN NEW.id <> OLD.id OR NEW.owner_project_id <> OLD.owner_project_id
  OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
  OR NEW.sequence <> OLD.sequence + 1
BEGIN SELECT RAISE(ABORT, 'Mission identity is immutable and every change appends one event'); END;
CREATE TRIGGER mission_events_no_update BEFORE UPDATE ON mission_events
BEGIN SELECT RAISE(ABORT, 'Mission Events are append-only'); END;
CREATE TRIGGER mission_events_no_delete BEFORE DELETE ON mission_events
BEGIN SELECT RAISE(ABORT, 'Mission Events are append-only'); END;
CREATE TRIGGER mission_event_evidence_no_update BEFORE UPDATE ON mission_event_evidence
BEGIN SELECT RAISE(ABORT, 'Mission Event Evidence is append-only'); END;
CREATE TRIGGER mission_event_evidence_no_delete BEFORE DELETE ON mission_event_evidence
BEGIN SELECT RAISE(ABORT, 'Mission Event Evidence is append-only'); END;
CREATE TRIGGER mission_project_references_no_update BEFORE UPDATE ON mission_project_references
BEGIN SELECT RAISE(ABORT, 'Mission references are append-only'); END;
CREATE TRIGGER mission_project_references_no_delete BEFORE DELETE ON mission_project_references
BEGIN SELECT RAISE(ABORT, 'Mission references are append-only'); END;
CREATE TRIGGER mission_knowledge_references_no_update BEFORE UPDATE ON mission_knowledge_references
BEGIN SELECT RAISE(ABORT, 'Mission references are append-only'); END;
CREATE TRIGGER mission_knowledge_references_no_delete BEFORE DELETE ON mission_knowledge_references
BEGIN SELECT RAISE(ABORT, 'Mission references are append-only'); END;
CREATE TRIGGER mission_attention_requests_answer_once BEFORE UPDATE ON mission_attention_requests
WHEN OLD.answered_at IS NOT NULL
  OR NEW.id <> OLD.id OR NEW.mission_id <> OLD.mission_id OR NEW.event_id <> OLD.event_id
  OR NEW.wait_reason <> OLD.wait_reason OR NEW.question <> OLD.question
  OR NEW.rationale <> OLD.rationale OR NEW.options_json <> OLD.options_json
BEGIN SELECT RAISE(ABORT, 'An Attention Request is answered once and otherwise immutable'); END;
CREATE TRIGGER mission_attention_requests_no_delete BEFORE DELETE ON mission_attention_requests
BEGIN SELECT RAISE(ABORT, 'Attention Requests are never deleted'); END;
CREATE TRIGGER mission_outcomes_no_update BEFORE UPDATE ON mission_outcomes
BEGIN SELECT RAISE(ABORT, 'Mission Outcomes are append-only'); END;
CREATE TRIGGER mission_outcomes_no_delete BEFORE DELETE ON mission_outcomes
BEGIN SELECT RAISE(ABORT, 'Mission Outcomes are append-only'); END;
CREATE TRIGGER mission_outcome_proposals_no_update BEFORE UPDATE ON mission_outcome_proposals
BEGIN SELECT RAISE(ABORT, 'Mission Outcomes are append-only'); END;
CREATE TRIGGER mission_outcome_proposals_no_delete BEFORE DELETE ON mission_outcome_proposals
BEGIN SELECT RAISE(ABORT, 'Mission Outcomes are append-only'); END;
CREATE TRIGGER mission_log_references_no_update BEFORE UPDATE ON mission_log_references
BEGIN SELECT RAISE(ABORT, 'Mission log references are append-only'); END;
CREATE TRIGGER mission_log_references_no_delete BEFORE DELETE ON mission_log_references
BEGIN SELECT RAISE(ABORT, 'Mission log references are append-only'); END;
