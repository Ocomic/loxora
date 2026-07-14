ALTER TABLE projects ADD COLUMN purpose TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_spaces ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_collections ADD COLUMN description TEXT NOT NULL DEFAULT '';

CREATE TABLE navigation_projection_generations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (length(trim(scope)) > 0),
  projection_version INTEGER NOT NULL,
  fingerprint_version TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  activity_fingerprint TEXT NOT NULL,
  projection_json TEXT NOT NULL,
  rebuilt_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (id, project_id, scope),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;

CREATE TABLE navigation_projection_state (
  project_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  projection_version INTEGER NOT NULL,
  active_generation_id TEXT,
  last_attempted_at TEXT,
  last_failure TEXT,
  PRIMARY KEY (project_id, scope, projection_version),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (active_generation_id, project_id, scope)
    REFERENCES navigation_projection_generations(id, project_id, scope)
) STRICT;

CREATE TABLE navigation_projection_entries (
  generation_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('Project','Space','Collection','Node')),
  entity_id TEXT NOT NULL,
  parent_entity_id TEXT,
  project_ref_id TEXT NOT NULL,
  space_ref_id TEXT,
  collection_ref_id TEXT,
  node_ref_id TEXT,
  display_name TEXT NOT NULL,
  preview TEXT,
  PRIMARY KEY (generation_id, entity_kind, entity_id),
  FOREIGN KEY (generation_id, project_id, scope)
    REFERENCES navigation_projection_generations(id, project_id, scope) ON DELETE CASCADE,
  FOREIGN KEY (project_ref_id) REFERENCES projects(id),
  FOREIGN KEY (space_ref_id, project_id) REFERENCES knowledge_spaces(id, project_id),
  FOREIGN KEY (collection_ref_id, project_id) REFERENCES knowledge_collections(id, project_id),
  FOREIGN KEY (node_ref_id, project_id) REFERENCES knowledge_nodes(id, project_id),
  CHECK (project_ref_id = project_id),
  CHECK (
    (entity_kind = 'Project' AND entity_id = project_ref_id AND space_ref_id IS NULL
      AND collection_ref_id IS NULL AND node_ref_id IS NULL)
    OR (entity_kind = 'Space' AND entity_id = space_ref_id AND space_ref_id IS NOT NULL
      AND collection_ref_id IS NULL AND node_ref_id IS NULL)
    OR (entity_kind = 'Collection' AND entity_id = collection_ref_id
      AND space_ref_id IS NOT NULL AND collection_ref_id IS NOT NULL AND node_ref_id IS NULL)
    OR (entity_kind = 'Node' AND entity_id = node_ref_id AND space_ref_id IS NOT NULL
      AND collection_ref_id IS NOT NULL AND node_ref_id IS NOT NULL)
  )
) STRICT;

CREATE TABLE navigation_projection_warnings (
  generation_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  warning_json TEXT NOT NULL,
  PRIMARY KEY (generation_id, category, code, entity_kind, entity_id),
  FOREIGN KEY (generation_id, project_id, scope)
    REFERENCES navigation_projection_generations(id, project_id, scope) ON DELETE CASCADE
) STRICT;

CREATE INDEX navigation_projection_entries_hierarchy
  ON navigation_projection_entries(project_id, scope, entity_kind, parent_entity_id, display_name, entity_id);
CREATE INDEX navigation_projection_warnings_lookup
  ON navigation_projection_warnings(project_id, scope, category, code);
