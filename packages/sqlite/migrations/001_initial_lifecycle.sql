CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE knowledge_spaces (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;

CREATE TABLE knowledge_collections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (id, project_id),
  UNIQUE (id, project_id, space_id),
  FOREIGN KEY (space_id, project_id) REFERENCES knowledge_spaces(id, project_id)
) STRICT;

CREATE TABLE source_references (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (length(trim(kind)) > 0),
  locator TEXT NOT NULL CHECK (length(trim(locator)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;

CREATE TABLE evidence_references (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_reference_id TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
  locator TEXT NOT NULL CHECK (length(trim(locator)) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (id, project_id),
  FOREIGN KEY (source_reference_id, project_id)
    REFERENCES source_references(id, project_id)
) STRICT;

CREATE TABLE knowledge_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  proposed_node_id TEXT NOT NULL UNIQUE,
  proposed_node_title TEXT NOT NULL CHECK (length(trim(proposed_node_title)) > 0),
  proposed_content TEXT NOT NULL CHECK (length(trim(proposed_content)) > 0),
  proposer_id TEXT NOT NULL CHECK (length(trim(proposer_id)) > 0),
  created_at TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (length(trim(scope)) > 0),
  status TEXT NOT NULL CHECK (status IN ('Submitted', 'Accepted', 'Rejected')),
  UNIQUE (id, project_id),
  FOREIGN KEY (collection_id, project_id, space_id)
    REFERENCES knowledge_collections(id, project_id, space_id)
) STRICT;

CREATE TABLE proposal_sources (
  proposal_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source_reference_id TEXT NOT NULL,
  PRIMARY KEY (proposal_id, source_reference_id),
  FOREIGN KEY (proposal_id, project_id) REFERENCES knowledge_proposals(id, project_id),
  FOREIGN KEY (source_reference_id, project_id)
    REFERENCES source_references(id, project_id)
) STRICT;

CREATE TABLE proposal_evidence (
  proposal_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (proposal_id, evidence_reference_id),
  FOREIGN KEY (proposal_id, project_id) REFERENCES knowledge_proposals(id, project_id),
  FOREIGN KEY (evidence_reference_id, project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE TABLE review_decisions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL CHECK (length(trim(reviewer_id)) > 0),
  decision TEXT NOT NULL CHECK (decision IN ('Accepted', 'Rejected')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  decided_at TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (length(trim(scope)) > 0),
  correlation_id TEXT NOT NULL,
  UNIQUE (id, project_id),
  FOREIGN KEY (proposal_id, project_id) REFERENCES knowledge_proposals(id, project_id)
) STRICT;

CREATE TABLE review_decision_evidence (
  review_decision_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (review_decision_id, evidence_reference_id),
  FOREIGN KEY (review_decision_id, project_id) REFERENCES review_decisions(id, project_id),
  FOREIGN KEY (evidence_reference_id, project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE TABLE knowledge_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (id, project_id),
  FOREIGN KEY (collection_id, project_id, space_id)
    REFERENCES knowledge_collections(id, project_id, space_id)
) STRICT;

CREATE TABLE knowledge_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (length(trim(scope)) > 0),
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  proposal_id TEXT NOT NULL UNIQUE,
  review_decision_id TEXT NOT NULL UNIQUE,
  proposer_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (id, project_id),
  UNIQUE (id, project_id, node_id, scope),
  FOREIGN KEY (node_id, project_id) REFERENCES knowledge_nodes(id, project_id),
  FOREIGN KEY (proposal_id, project_id) REFERENCES knowledge_proposals(id, project_id),
  FOREIGN KEY (review_decision_id, project_id) REFERENCES review_decisions(id, project_id)
) STRICT;

CREATE TABLE revision_evidence (
  revision_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (revision_id, evidence_reference_id),
  FOREIGN KEY (revision_id, project_id) REFERENCES knowledge_revisions(id, project_id),
  FOREIGN KEY (evidence_reference_id, project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE TABLE current_revisions (
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  PRIMARY KEY (project_id, node_id, scope),
  FOREIGN KEY (revision_id, project_id, node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope)
) STRICT;

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;

CREATE TRIGGER knowledge_revisions_no_update
BEFORE UPDATE ON knowledge_revisions
BEGIN
  SELECT RAISE(ABORT, 'accepted Knowledge Revisions are immutable');
END;

CREATE TRIGGER knowledge_revisions_no_delete
BEFORE DELETE ON knowledge_revisions
BEGIN
  SELECT RAISE(ABORT, 'accepted Knowledge Revisions are immutable');
END;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'Audit Events are append-only');
END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'Audit Events are append-only');
END;
