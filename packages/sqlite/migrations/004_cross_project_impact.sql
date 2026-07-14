CREATE TABLE cross_project_relationship_proposals (
  id TEXT PRIMARY KEY,
  source_project_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  target_revision_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (length(trim(scope)) > 0),
  relationship_type TEXT NOT NULL CHECK (relationship_type = 'DependsOn'),
  confidence TEXT NOT NULL CHECK (confidence IN ('Low','Medium','High')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  visibility TEXT NOT NULL CHECK (visibility IN ('SharedBetweenProjects','Restricted')),
  proposer_id TEXT NOT NULL CHECK (length(trim(proposer_id)) > 0),
  proposed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Submitted','Accepted','Rejected')),
  correlation_id TEXT NOT NULL,
  UNIQUE (id, source_project_id, target_project_id),
  CHECK (source_project_id <> target_project_id),
  FOREIGN KEY (source_revision_id, source_project_id, source_node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope),
  FOREIGN KEY (target_revision_id, target_project_id, target_node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope)
) STRICT;

CREATE TABLE cross_project_relationship_proposal_evidence (
  proposal_id TEXT NOT NULL,
  source_project_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL,
  evidence_project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (proposal_id, evidence_project_id, evidence_reference_id),
  CHECK (evidence_project_id = source_project_id OR evidence_project_id = target_project_id),
  FOREIGN KEY (proposal_id, source_project_id, target_project_id)
    REFERENCES cross_project_relationship_proposals(id, source_project_id, target_project_id),
  FOREIGN KEY (evidence_reference_id, evidence_project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE TABLE cross_project_relationship_review_decisions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL UNIQUE,
  source_project_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL CHECK (length(trim(reviewer_id)) > 0),
  decision TEXT NOT NULL CHECK (decision IN ('Accepted','Rejected')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  decided_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (id, source_project_id, target_project_id),
  FOREIGN KEY (proposal_id, source_project_id, target_project_id)
    REFERENCES cross_project_relationship_proposals(id, source_project_id, target_project_id)
) STRICT;

CREATE TABLE cross_project_relationship_review_evidence (
  review_decision_id TEXT NOT NULL,
  source_project_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL,
  evidence_project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (review_decision_id, evidence_project_id, evidence_reference_id),
  CHECK (evidence_project_id = source_project_id OR evidence_project_id = target_project_id),
  FOREIGN KEY (review_decision_id, source_project_id, target_project_id)
    REFERENCES cross_project_relationship_review_decisions(id, source_project_id, target_project_id),
  FOREIGN KEY (evidence_reference_id, evidence_project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE TABLE cross_project_relationships (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL UNIQUE,
  review_decision_id TEXT NOT NULL UNIQUE,
  source_project_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  target_revision_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (length(trim(scope)) > 0),
  relationship_type TEXT NOT NULL CHECK (relationship_type = 'DependsOn'),
  confidence TEXT NOT NULL CHECK (confidence IN ('Low','Medium','High')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  visibility TEXT NOT NULL CHECK (visibility IN ('SharedBetweenProjects','Restricted')),
  accepted_at TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (id, source_project_id, target_project_id),
  CHECK (source_project_id <> target_project_id),
  FOREIGN KEY (proposal_id, source_project_id, target_project_id)
    REFERENCES cross_project_relationship_proposals(id, source_project_id, target_project_id),
  FOREIGN KEY (review_decision_id, source_project_id, target_project_id)
    REFERENCES cross_project_relationship_review_decisions(id, source_project_id, target_project_id),
  FOREIGN KEY (source_revision_id, source_project_id, source_node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope),
  FOREIGN KEY (target_revision_id, target_project_id, target_node_id, scope)
    REFERENCES knowledge_revisions(id, project_id, node_id, scope)
) STRICT;

CREATE TABLE cross_project_relationship_evidence (
  relationship_id TEXT NOT NULL,
  source_project_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL,
  evidence_project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (relationship_id, evidence_project_id, evidence_reference_id),
  CHECK (evidence_project_id = source_project_id OR evidence_project_id = target_project_id),
  FOREIGN KEY (relationship_id, source_project_id, target_project_id)
    REFERENCES cross_project_relationships(id, source_project_id, target_project_id),
  FOREIGN KEY (evidence_reference_id, evidence_project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE TABLE impact_assessments (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL,
  source_project_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL,
  provider_revision_id TEXT NOT NULL,
  consumer_revision_id TEXT NOT NULL,
  change_compatibility TEXT NOT NULL CHECK (change_compatibility IN ('Compatible','PotentiallyBreaking','Breaking')),
  consumer_requirement TEXT NOT NULL CHECK (consumer_requirement IN ('Optional','Required')),
  operational_criticality TEXT NOT NULL CHECK (operational_criticality IN ('Normal','Critical')),
  observed_failure INTEGER NOT NULL CHECK (observed_failure IN (0,1)),
  change_summary TEXT NOT NULL CHECK (length(trim(change_summary)) > 0),
  consumer_constraint TEXT NOT NULL CHECK (length(trim(consumer_constraint)) > 0),
  consequence TEXT NOT NULL CHECK (length(trim(consequence)) > 0),
  severity TEXT NOT NULL CHECK (severity IN ('Low','Medium','High','Critical')),
  confidence TEXT NOT NULL CHECK (confidence IN ('Low','Medium','High')),
  severity_evaluator_version TEXT NOT NULL,
  basis_fingerprint_version TEXT NOT NULL,
  basis_fingerprint TEXT NOT NULL,
  requesting_actor_id TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (id, source_project_id, target_project_id),
  FOREIGN KEY (relationship_id, source_project_id, target_project_id)
    REFERENCES cross_project_relationships(id, source_project_id, target_project_id),
  FOREIGN KEY (consumer_revision_id, source_project_id)
    REFERENCES knowledge_revisions(id, project_id),
  FOREIGN KEY (provider_revision_id, target_project_id)
    REFERENCES knowledge_revisions(id, project_id)
) STRICT;

CREATE TABLE impact_assessment_evidence (
  assessment_id TEXT NOT NULL,
  source_project_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL,
  evidence_project_id TEXT NOT NULL,
  evidence_reference_id TEXT NOT NULL,
  PRIMARY KEY (assessment_id, evidence_project_id, evidence_reference_id),
  CHECK (evidence_project_id = source_project_id OR evidence_project_id = target_project_id),
  FOREIGN KEY (assessment_id, source_project_id, target_project_id)
    REFERENCES impact_assessments(id, source_project_id, target_project_id),
  FOREIGN KEY (evidence_reference_id, evidence_project_id)
    REFERENCES evidence_references(id, project_id)
) STRICT;

CREATE INDEX cross_project_relationships_source_idx
  ON cross_project_relationships(source_project_id, source_node_id, scope, source_revision_id, id);
CREATE INDEX cross_project_relationships_target_idx
  ON cross_project_relationships(target_project_id, target_node_id, scope, target_revision_id, id);
CREATE INDEX cross_project_relationship_proposals_status_idx
  ON cross_project_relationship_proposals(status, source_project_id, target_project_id, scope);
CREATE INDEX impact_assessments_binding_idx
  ON impact_assessments(relationship_id, provider_revision_id, consumer_revision_id, assessed_at DESC, id);
CREATE INDEX impact_assessments_fingerprint_idx
  ON impact_assessments(basis_fingerprint_version, basis_fingerprint);

CREATE TRIGGER cross_project_relationships_no_update BEFORE UPDATE ON cross_project_relationships
BEGIN SELECT RAISE(ABORT, 'accepted Cross-Project Relationships are immutable'); END;
CREATE TRIGGER cross_project_relationships_no_delete BEFORE DELETE ON cross_project_relationships
BEGIN SELECT RAISE(ABORT, 'accepted Cross-Project Relationships are immutable'); END;
CREATE TRIGGER cross_project_relationship_evidence_no_update BEFORE UPDATE ON cross_project_relationship_evidence
BEGIN SELECT RAISE(ABORT, 'Cross-Project Relationship Evidence is append-only'); END;
CREATE TRIGGER cross_project_relationship_evidence_no_delete BEFORE DELETE ON cross_project_relationship_evidence
BEGIN SELECT RAISE(ABORT, 'Cross-Project Relationship Evidence is append-only'); END;
CREATE TRIGGER impact_assessments_no_update BEFORE UPDATE ON impact_assessments
BEGIN SELECT RAISE(ABORT, 'Impact Assessments are immutable'); END;
CREATE TRIGGER impact_assessments_no_delete BEFORE DELETE ON impact_assessments
BEGIN SELECT RAISE(ABORT, 'Impact Assessments are immutable'); END;
CREATE TRIGGER impact_assessment_evidence_no_update BEFORE UPDATE ON impact_assessment_evidence
BEGIN SELECT RAISE(ABORT, 'Impact Assessment Evidence is append-only'); END;
CREATE TRIGGER impact_assessment_evidence_no_delete BEFORE DELETE ON impact_assessment_evidence
BEGIN SELECT RAISE(ABORT, 'Impact Assessment Evidence is append-only'); END;
