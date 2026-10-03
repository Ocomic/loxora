-- ADR-006: plan revisions, plan revision proposals, InProgress status, and Node keys.
-- planned_knowledge_items stays the immutable revision 1 of each plan. Later revisions and
-- proposals are appended to planned_knowledge_revisions; the effective state is a view.

-- 1. Widen the status check of planned_knowledge_items to include InProgress (table rebuild).
DROP TRIGGER planned_knowledge_nodes_owner_guard;
DROP TRIGGER planned_knowledge_evidence_owner_guard;

CREATE TABLE planned_knowledge_items_rebuilt (
  id TEXT PRIMARY KEY,
  owner_project_id TEXT NOT NULL,
  related_project_id TEXT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  status TEXT NOT NULL CHECK (status IN ('Proposed','Deferred','Ready','InProgress','Completed','Cancelled')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  blocking_condition TEXT NOT NULL CHECK (length(trim(blocking_condition)) > 0),
  author_id TEXT NOT NULL CHECK (length(trim(author_id)) > 0),
  created_at TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (length(trim(scope)) > 0),
  related_revision_project_id TEXT,
  related_revision_id TEXT,
  UNIQUE (id, owner_project_id),
  FOREIGN KEY (owner_project_id) REFERENCES projects(id),
  FOREIGN KEY (related_project_id) REFERENCES projects(id),
  FOREIGN KEY (related_revision_id, related_revision_project_id)
    REFERENCES knowledge_revisions(id, project_id),
  CHECK ((related_revision_id IS NULL) = (related_revision_project_id IS NULL)),
  CHECK (related_project_id IS NULL OR related_project_id <> owner_project_id),
  CHECK (related_revision_project_id IS NULL OR
    related_revision_project_id = owner_project_id OR
    related_revision_project_id = related_project_id)
) STRICT;

INSERT INTO planned_knowledge_items_rebuilt
  SELECT id, owner_project_id, related_project_id, title, description, status, reason,
         blocking_condition, author_id, created_at, scope, related_revision_project_id,
         related_revision_id
  FROM planned_knowledge_items;

DROP TABLE planned_knowledge_items;
ALTER TABLE planned_knowledge_items_rebuilt RENAME TO planned_knowledge_items;

CREATE INDEX planned_knowledge_project_scope_status
  ON planned_knowledge_items(owner_project_id, scope, status, created_at, id);
CREATE INDEX planned_knowledge_related_project
  ON planned_knowledge_items(related_project_id, scope, status, created_at, id);
CREATE INDEX planned_knowledge_related_revision
  ON planned_knowledge_items(related_revision_project_id, related_revision_id);

CREATE TRIGGER planned_knowledge_items_no_update BEFORE UPDATE ON planned_knowledge_items
BEGIN SELECT RAISE(ABORT, 'planned knowledge is append-only'); END;
CREATE TRIGGER planned_knowledge_items_no_delete BEFORE DELETE ON planned_knowledge_items
BEGIN SELECT RAISE(ABORT, 'planned knowledge is append-only'); END;

CREATE TRIGGER planned_knowledge_nodes_owner_guard
BEFORE INSERT ON planned_knowledge_nodes
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM planned_knowledge_items p
    WHERE p.id = NEW.planned_knowledge_id
      AND p.owner_project_id = NEW.owner_project_id
      AND (NEW.node_project_id = p.owner_project_id OR NEW.node_project_id = p.related_project_id)
  ) THEN RAISE(ABORT, 'planned Node project is not an endpoint Project') END;
END;

CREATE TRIGGER planned_knowledge_evidence_owner_guard
BEFORE INSERT ON planned_knowledge_evidence
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM planned_knowledge_items p
    WHERE p.id = NEW.planned_knowledge_id
      AND p.owner_project_id = NEW.owner_project_id
      AND (NEW.evidence_project_id = p.owner_project_id OR NEW.evidence_project_id = p.related_project_id)
  ) THEN RAISE(ABORT, 'planned Evidence project is not an endpoint Project') END;
END;

-- 2. Plan revisions (revision_number >= 2) and plan revision proposals, append-only.
CREATE TABLE planned_knowledge_revisions (
  id TEXT PRIMARY KEY,
  planned_knowledge_id TEXT NOT NULL,
  owner_project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('Revision','Proposal')),
  revision_number INTEGER,
  base_revision_number INTEGER NOT NULL CHECK (base_revision_number >= 1),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  status TEXT NOT NULL CHECK (status IN ('Proposed','Deferred','Ready','InProgress','Completed','Cancelled')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  blocking_condition TEXT NOT NULL CHECK (length(trim(blocking_condition)) > 0),
  related_project_id TEXT,
  related_revision_project_id TEXT,
  related_revision_id TEXT,
  changed_fields TEXT NOT NULL CHECK (length(trim(changed_fields)) > 0),
  change_reason TEXT NOT NULL CHECK (length(trim(change_reason)) > 0),
  author_id TEXT NOT NULL CHECK (length(trim(author_id)) > 0),
  created_at TEXT NOT NULL,
  source_proposal_id TEXT,
  UNIQUE (id, owner_project_id),
  UNIQUE (planned_knowledge_id, revision_number),
  FOREIGN KEY (planned_knowledge_id, owner_project_id)
    REFERENCES planned_knowledge_items(id, owner_project_id),
  FOREIGN KEY (related_project_id) REFERENCES projects(id),
  FOREIGN KEY (related_revision_id, related_revision_project_id)
    REFERENCES knowledge_revisions(id, project_id),
  FOREIGN KEY (source_proposal_id) REFERENCES planned_knowledge_revisions(id),
  CHECK ((kind = 'Revision') = (revision_number IS NOT NULL)),
  CHECK (revision_number IS NULL OR revision_number >= 2),
  CHECK (kind = 'Revision' OR source_proposal_id IS NULL),
  CHECK ((related_revision_id IS NULL) = (related_revision_project_id IS NULL)),
  CHECK (related_project_id IS NULL OR related_project_id <> owner_project_id),
  CHECK (related_revision_project_id IS NULL OR
    related_revision_project_id = owner_project_id OR
    related_revision_project_id = related_project_id)
) STRICT;

CREATE INDEX planned_knowledge_revisions_plan
  ON planned_knowledge_revisions(planned_knowledge_id, kind, revision_number, created_at, id);

CREATE TABLE planned_knowledge_revision_nodes (
  revision_id TEXT NOT NULL,
  owner_project_id TEXT NOT NULL,
  node_project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  PRIMARY KEY (revision_id, node_project_id, node_id),
  FOREIGN KEY (revision_id, owner_project_id)
    REFERENCES planned_knowledge_revisions(id, owner_project_id),
  FOREIGN KEY (node_id, node_project_id) REFERENCES knowledge_nodes(id, project_id)
) STRICT;

CREATE TABLE planned_knowledge_revision_evidence (
  revision_id TEXT NOT NULL,
  owner_project_id TEXT NOT NULL,
  evidence_project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (revision_id, evidence_project_id, evidence_reference_id),
  FOREIGN KEY (revision_id, owner_project_id)
    REFERENCES planned_knowledge_revisions(id, owner_project_id),
  FOREIGN KEY (evidence_reference_id, evidence_project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE INDEX planned_knowledge_revision_nodes_lookup
  ON planned_knowledge_revision_nodes(node_project_id, node_id, revision_id);

CREATE TRIGGER planned_knowledge_revision_nodes_owner_guard
BEFORE INSERT ON planned_knowledge_revision_nodes
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM planned_knowledge_revisions r
    WHERE r.id = NEW.revision_id
      AND r.owner_project_id = NEW.owner_project_id
      AND (NEW.node_project_id = r.owner_project_id OR NEW.node_project_id = r.related_project_id)
  ) THEN RAISE(ABORT, 'planned Node project is not an endpoint Project') END;
END;

CREATE TRIGGER planned_knowledge_revision_evidence_owner_guard
BEFORE INSERT ON planned_knowledge_revision_evidence
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM planned_knowledge_revisions r
    WHERE r.id = NEW.revision_id
      AND r.owner_project_id = NEW.owner_project_id
      AND (NEW.evidence_project_id = r.owner_project_id OR NEW.evidence_project_id = r.related_project_id)
  ) THEN RAISE(ABORT, 'planned Evidence project is not an endpoint Project') END;
END;

-- 3. Review decisions on plan revision proposals.
CREATE TABLE planned_knowledge_revision_decisions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL UNIQUE,
  owner_project_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL CHECK (length(trim(reviewer_id)) > 0),
  decision TEXT NOT NULL CHECK (decision IN ('Accepted','Rejected')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  decided_at TEXT NOT NULL,
  resulting_revision_id TEXT,
  UNIQUE (id, owner_project_id),
  FOREIGN KEY (proposal_id, owner_project_id)
    REFERENCES planned_knowledge_revisions(id, owner_project_id),
  FOREIGN KEY (resulting_revision_id) REFERENCES planned_knowledge_revisions(id),
  CHECK ((decision = 'Accepted') = (resulting_revision_id IS NOT NULL))
) STRICT;

CREATE TABLE planned_knowledge_revision_decision_evidence (
  decision_id TEXT NOT NULL,
  owner_project_id TEXT NOT NULL,
  evidence_project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (decision_id, evidence_project_id, evidence_reference_id),
  FOREIGN KEY (decision_id, owner_project_id)
    REFERENCES planned_knowledge_revision_decisions(id, owner_project_id),
  FOREIGN KEY (evidence_reference_id, evidence_project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

-- 4. Node keys: unique per Project (case-insensitive), immutable, never reused.
-- node_id may be the reserved Node id of a submitted proposal; the Node row is created on acceptance.
CREATE TABLE knowledge_node_keys (
  project_id TEXT NOT NULL,
  key_normalized TEXT NOT NULL CHECK (key_normalized = lower(key)),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 32),
  node_id TEXT NOT NULL UNIQUE,
  assigned_by TEXT NOT NULL CHECK (length(trim(assigned_by)) > 0),
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (project_id, key_normalized),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;

-- 5. Append-only guards.
CREATE TRIGGER planned_knowledge_revisions_no_update BEFORE UPDATE ON planned_knowledge_revisions
BEGIN SELECT RAISE(ABORT, 'plan revisions are append-only'); END;
CREATE TRIGGER planned_knowledge_revisions_no_delete BEFORE DELETE ON planned_knowledge_revisions
BEGIN SELECT RAISE(ABORT, 'plan revisions are append-only'); END;
CREATE TRIGGER planned_knowledge_revision_nodes_no_update BEFORE UPDATE ON planned_knowledge_revision_nodes
BEGIN SELECT RAISE(ABORT, 'plan revision Nodes are append-only'); END;
CREATE TRIGGER planned_knowledge_revision_nodes_no_delete BEFORE DELETE ON planned_knowledge_revision_nodes
BEGIN SELECT RAISE(ABORT, 'plan revision Nodes are append-only'); END;
CREATE TRIGGER planned_knowledge_revision_evidence_no_update BEFORE UPDATE ON planned_knowledge_revision_evidence
BEGIN SELECT RAISE(ABORT, 'plan revision Evidence is append-only'); END;
CREATE TRIGGER planned_knowledge_revision_evidence_no_delete BEFORE DELETE ON planned_knowledge_revision_evidence
BEGIN SELECT RAISE(ABORT, 'plan revision Evidence is append-only'); END;
CREATE TRIGGER planned_knowledge_revision_decisions_no_update BEFORE UPDATE ON planned_knowledge_revision_decisions
BEGIN SELECT RAISE(ABORT, 'plan revision decisions are append-only'); END;
CREATE TRIGGER planned_knowledge_revision_decisions_no_delete BEFORE DELETE ON planned_knowledge_revision_decisions
BEGIN SELECT RAISE(ABORT, 'plan revision decisions are append-only'); END;
CREATE TRIGGER planned_knowledge_revision_decision_evidence_no_update BEFORE UPDATE ON planned_knowledge_revision_decision_evidence
BEGIN SELECT RAISE(ABORT, 'plan revision decision Evidence is append-only'); END;
CREATE TRIGGER planned_knowledge_revision_decision_evidence_no_delete BEFORE DELETE ON planned_knowledge_revision_decision_evidence
BEGIN SELECT RAISE(ABORT, 'plan revision decision Evidence is append-only'); END;
CREATE TRIGGER knowledge_node_keys_no_update BEFORE UPDATE ON knowledge_node_keys
BEGIN SELECT RAISE(ABORT, 'Node keys are immutable'); END;
CREATE TRIGGER knowledge_node_keys_no_delete BEFORE DELETE ON knowledge_node_keys
BEGIN SELECT RAISE(ABORT, 'Node keys are never reused'); END;

-- 6. Effective plan state: the latest Revision, or revision 1 from planned_knowledge_items.
CREATE VIEW planned_knowledge_latest_revisions AS
  SELECT r.* FROM planned_knowledge_revisions r
  WHERE r.kind = 'Revision'
    AND r.revision_number = (
      SELECT MAX(x.revision_number) FROM planned_knowledge_revisions x
      WHERE x.planned_knowledge_id = r.planned_knowledge_id AND x.kind = 'Revision'
    );

CREATE VIEW planned_knowledge_effective AS
  SELECT p.id, p.owner_project_id, p.scope, p.author_id, p.created_at,
         COALESCE(r.revision_number, 1) AS revision_number,
         r.id AS effective_revision_id,
         COALESCE(r.title, p.title) AS title,
         COALESCE(r.description, p.description) AS description,
         COALESCE(r.status, p.status) AS status,
         COALESCE(r.reason, p.reason) AS reason,
         COALESCE(r.blocking_condition, p.blocking_condition) AS blocking_condition,
         CASE WHEN r.id IS NULL THEN p.related_project_id ELSE r.related_project_id END AS related_project_id,
         CASE WHEN r.id IS NULL THEN p.related_revision_project_id ELSE r.related_revision_project_id END AS related_revision_project_id,
         CASE WHEN r.id IS NULL THEN p.related_revision_id ELSE r.related_revision_id END AS related_revision_id,
         COALESCE(r.author_id, p.author_id) AS revised_by,
         COALESCE(r.created_at, p.created_at) AS revised_at
  FROM planned_knowledge_items p
  LEFT JOIN planned_knowledge_latest_revisions r ON r.planned_knowledge_id = p.id;

CREATE VIEW planned_knowledge_effective_nodes AS
  SELECT e.id AS planned_knowledge_id, e.owner_project_id, n.node_project_id, n.node_id
  FROM planned_knowledge_effective e
  JOIN planned_knowledge_nodes n ON n.planned_knowledge_id = e.id
  WHERE e.effective_revision_id IS NULL
  UNION ALL
  SELECT e.id, e.owner_project_id, rn.node_project_id, rn.node_id
  FROM planned_knowledge_effective e
  JOIN planned_knowledge_revision_nodes rn ON rn.revision_id = e.effective_revision_id;

CREATE VIEW planned_knowledge_effective_evidence AS
  SELECT e.id AS planned_knowledge_id, e.owner_project_id, pe.evidence_project_id, pe.evidence_reference_id
  FROM planned_knowledge_effective e
  JOIN planned_knowledge_evidence pe ON pe.planned_knowledge_id = e.id
  WHERE e.effective_revision_id IS NULL
  UNION ALL
  SELECT e.id, e.owner_project_id, re.evidence_project_id, re.evidence_reference_id
  FROM planned_knowledge_effective e
  JOIN planned_knowledge_revision_evidence re ON re.revision_id = e.effective_revision_id;
