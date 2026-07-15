CREATE TABLE planned_knowledge_items (
  id TEXT PRIMARY KEY,
  owner_project_id TEXT NOT NULL,
  related_project_id TEXT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  status TEXT NOT NULL CHECK (status IN ('Proposed','Deferred','Ready','Completed','Cancelled')),
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

CREATE TABLE planned_knowledge_nodes (
  planned_knowledge_id TEXT NOT NULL,
  owner_project_id TEXT NOT NULL,
  node_project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  PRIMARY KEY (planned_knowledge_id, node_project_id, node_id),
  FOREIGN KEY (planned_knowledge_id, owner_project_id)
    REFERENCES planned_knowledge_items(id, owner_project_id),
  FOREIGN KEY (node_id, node_project_id) REFERENCES knowledge_nodes(id, project_id)
) STRICT;

CREATE TABLE planned_knowledge_evidence (
  planned_knowledge_id TEXT NOT NULL,
  owner_project_id TEXT NOT NULL,
  evidence_project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (planned_knowledge_id, evidence_project_id, evidence_reference_id),
  FOREIGN KEY (planned_knowledge_id, owner_project_id)
    REFERENCES planned_knowledge_items(id, owner_project_id),
  FOREIGN KEY (evidence_reference_id, evidence_project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE INDEX planned_knowledge_project_scope_status
  ON planned_knowledge_items(owner_project_id, scope, status, created_at, id);
CREATE INDEX planned_knowledge_related_project
  ON planned_knowledge_items(related_project_id, scope, status, created_at, id);
CREATE INDEX planned_knowledge_related_revision
  ON planned_knowledge_items(related_revision_project_id, related_revision_id);
CREATE INDEX planned_knowledge_nodes_lookup
  ON planned_knowledge_nodes(node_project_id, node_id, planned_knowledge_id);

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

CREATE TRIGGER planned_knowledge_items_no_update BEFORE UPDATE ON planned_knowledge_items
BEGIN SELECT RAISE(ABORT, 'planned knowledge is append-only'); END;
CREATE TRIGGER planned_knowledge_items_no_delete BEFORE DELETE ON planned_knowledge_items
BEGIN SELECT RAISE(ABORT, 'planned knowledge is append-only'); END;
CREATE TRIGGER planned_knowledge_nodes_no_update BEFORE UPDATE ON planned_knowledge_nodes
BEGIN SELECT RAISE(ABORT, 'planned knowledge Nodes are append-only'); END;
CREATE TRIGGER planned_knowledge_nodes_no_delete BEFORE DELETE ON planned_knowledge_nodes
BEGIN SELECT RAISE(ABORT, 'planned knowledge Nodes are append-only'); END;
CREATE TRIGGER planned_knowledge_evidence_no_update BEFORE UPDATE ON planned_knowledge_evidence
BEGIN SELECT RAISE(ABORT, 'planned knowledge Evidence is append-only'); END;
CREATE TRIGGER planned_knowledge_evidence_no_delete BEFORE DELETE ON planned_knowledge_evidence
BEGIN SELECT RAISE(ABORT, 'planned knowledge Evidence is append-only'); END;
