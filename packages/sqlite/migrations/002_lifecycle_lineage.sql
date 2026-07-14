CREATE TABLE rollback_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (length(trim(scope)) > 0),
  reverted_revision_id TEXT NOT NULL,
  semantic_source_revision_id TEXT NOT NULL,
  actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  recorded_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (id, project_id),
  UNIQUE (id, project_id, node_id, scope),
  CHECK (reverted_revision_id <> semantic_source_revision_id),
  FOREIGN KEY (reverted_revision_id, project_id, node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope),
  FOREIGN KEY (semantic_source_revision_id, project_id, node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope)
) STRICT;

CREATE TABLE rollback_event_evidence (
  rollback_event_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (rollback_event_id, evidence_reference_id),
  FOREIGN KEY (rollback_event_id, project_id) REFERENCES rollback_events(id, project_id),
  FOREIGN KEY (evidence_reference_id, project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE TABLE knowledge_proposals_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  proposed_node_id TEXT NOT NULL,
  proposed_node_title TEXT NOT NULL CHECK (length(trim(proposed_node_title)) > 0),
  proposed_content TEXT NOT NULL CHECK (length(trim(proposed_content)) > 0),
  proposer_id TEXT NOT NULL CHECK (length(trim(proposer_id)) > 0),
  created_at TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (length(trim(scope)) > 0),
  status TEXT NOT NULL CHECK (status IN ('Submitted', 'Accepted', 'Rejected')),
  proposal_kind TEXT NOT NULL CHECK (proposal_kind IN ('Initial', 'Successor', 'Restoration')),
  change_reason TEXT CHECK (change_reason IS NULL OR length(trim(change_reason)) > 0),
  expected_predecessor_revision_id TEXT,
  rollback_event_id TEXT,
  restoration_source_revision_id TEXT,
  UNIQUE (id, project_id),
  FOREIGN KEY (collection_id, project_id, space_id)
    REFERENCES knowledge_collections(id, project_id, space_id),
  FOREIGN KEY (expected_predecessor_revision_id, project_id, proposed_node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope),
  FOREIGN KEY (rollback_event_id, project_id, proposed_node_id, scope)
    REFERENCES rollback_events(id, project_id, node_id, scope),
  FOREIGN KEY (restoration_source_revision_id, project_id, proposed_node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope),
  CHECK (
    (proposal_kind = 'Initial' AND expected_predecessor_revision_id IS NULL
      AND rollback_event_id IS NULL AND restoration_source_revision_id IS NULL)
    OR
    (proposal_kind = 'Successor' AND change_reason IS NOT NULL
      AND expected_predecessor_revision_id IS NOT NULL
      AND rollback_event_id IS NULL AND restoration_source_revision_id IS NULL)
    OR
    (proposal_kind = 'Restoration' AND change_reason IS NOT NULL
      AND expected_predecessor_revision_id IS NOT NULL
      AND rollback_event_id IS NOT NULL AND restoration_source_revision_id IS NOT NULL)
  )
) STRICT;

INSERT INTO knowledge_proposals_new (
  id, project_id, space_id, collection_id, proposed_node_id, proposed_node_title,
  proposed_content, proposer_id, created_at, scope, status, proposal_kind, change_reason,
  expected_predecessor_revision_id, rollback_event_id, restoration_source_revision_id
)
SELECT id, project_id, space_id, collection_id, proposed_node_id, proposed_node_title,
  proposed_content, proposer_id, created_at, scope, status, 'Initial', NULL, NULL, NULL, NULL
FROM knowledge_proposals;

DROP TABLE knowledge_proposals;
ALTER TABLE knowledge_proposals_new RENAME TO knowledge_proposals;

CREATE INDEX knowledge_proposals_target_index
  ON knowledge_proposals(project_id, proposed_node_id, scope, proposal_kind, status);
CREATE INDEX knowledge_revisions_history_index
  ON knowledge_revisions(project_id, node_id, scope, accepted_at, id);
CREATE INDEX rollback_events_target_index
  ON rollback_events(project_id, node_id, scope, reverted_revision_id);

CREATE TABLE revision_relationships (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  target_revision_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN
    ('DirectPredecessor', 'Supersedes', 'RestoredFrom', 'Reverts')),
  rollback_event_id TEXT,
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (source_revision_id, relationship_type),
  UNIQUE (id, project_id),
  CHECK (source_revision_id <> target_revision_id),
  CHECK (
    (relationship_type IN ('DirectPredecessor', 'Supersedes') AND rollback_event_id IS NULL)
    OR
    (relationship_type IN ('RestoredFrom', 'Reverts') AND rollback_event_id IS NOT NULL)
  ),
  FOREIGN KEY (source_revision_id, project_id, node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope),
  FOREIGN KEY (target_revision_id, project_id, node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope),
  FOREIGN KEY (rollback_event_id, project_id, node_id, scope)
    REFERENCES rollback_events(id, project_id, node_id, scope)
) STRICT;

CREATE TABLE revision_relationship_evidence (
  revision_relationship_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (revision_relationship_id, evidence_reference_id),
  FOREIGN KEY (revision_relationship_id, project_id)
    REFERENCES revision_relationships(id, project_id),
  FOREIGN KEY (evidence_reference_id, project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE TABLE audit_event_evidence (
  audit_event_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (audit_event_id, evidence_reference_id),
  FOREIGN KEY (audit_event_id, project_id) REFERENCES audit_events(id, project_id),
  FOREIGN KEY (evidence_reference_id, project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE INDEX revision_relationships_source_index
  ON revision_relationships(project_id, node_id, scope, source_revision_id);
CREATE INDEX revision_relationships_target_index
  ON revision_relationships(project_id, node_id, scope, target_revision_id);

CREATE TRIGGER revision_relationships_no_cycles
BEFORE INSERT ON revision_relationships
BEGIN
  SELECT CASE WHEN EXISTS (
    WITH RECURSIVE ancestors(revision_id) AS (
      SELECT NEW.target_revision_id
      UNION
      SELECT rr.target_revision_id
      FROM revision_relationships rr
      JOIN ancestors a ON rr.source_revision_id = a.revision_id
      WHERE rr.project_id = NEW.project_id AND rr.node_id = NEW.node_id AND rr.scope = NEW.scope
    )
    SELECT 1 FROM ancestors WHERE revision_id = NEW.source_revision_id
  ) THEN RAISE(ABORT, 'revision lineage cycle') END;
END;

CREATE TRIGGER rollback_events_no_update BEFORE UPDATE ON rollback_events
BEGIN SELECT RAISE(ABORT, 'Rollback Events are append-only'); END;
CREATE TRIGGER rollback_events_no_delete BEFORE DELETE ON rollback_events
BEGIN SELECT RAISE(ABORT, 'Rollback Events are append-only'); END;
CREATE TRIGGER rollback_event_evidence_no_update BEFORE UPDATE ON rollback_event_evidence
BEGIN SELECT RAISE(ABORT, 'Rollback Event Evidence is append-only'); END;
CREATE TRIGGER rollback_event_evidence_no_delete BEFORE DELETE ON rollback_event_evidence
BEGIN SELECT RAISE(ABORT, 'Rollback Event Evidence is append-only'); END;
CREATE TRIGGER revision_relationships_no_update BEFORE UPDATE ON revision_relationships
BEGIN SELECT RAISE(ABORT, 'Revision Relationships are append-only'); END;
CREATE TRIGGER revision_relationships_no_delete BEFORE DELETE ON revision_relationships
BEGIN SELECT RAISE(ABORT, 'Revision Relationships are append-only'); END;
CREATE TRIGGER revision_relationship_evidence_no_update BEFORE UPDATE ON revision_relationship_evidence
BEGIN SELECT RAISE(ABORT, 'Revision Relationship Evidence is append-only'); END;
CREATE TRIGGER revision_relationship_evidence_no_delete BEFORE DELETE ON revision_relationship_evidence
BEGIN SELECT RAISE(ABORT, 'Revision Relationship Evidence is append-only'); END;
CREATE TRIGGER audit_event_evidence_no_update BEFORE UPDATE ON audit_event_evidence
BEGIN SELECT RAISE(ABORT, 'Audit Event Evidence is append-only'); END;
CREATE TRIGGER audit_event_evidence_no_delete BEFORE DELETE ON audit_event_evidence
BEGIN SELECT RAISE(ABORT, 'Audit Event Evidence is append-only'); END;
