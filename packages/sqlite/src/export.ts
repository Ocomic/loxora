import {
  IntegrityError,
  ValidationError,
  WORKSPACE_EXPORT_DERIVED_SECTIONS,
  WORKSPACE_EXPORT_FORMAT,
  WORKSPACE_EXPORT_FORMAT_VERSION,
  WORKSPACE_EXPORT_SECTIONS,
  assertWorkspaceExport,
  workspaceExportRecords,
  type WorkspaceExport,
  type WorkspaceExportRecord,
  type WorkspaceExportSectionSpec,
  type WorkspaceExportStore,
} from "@loxora/core";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

/** Export section name to SQLite table. Field names map to columns by camelCase <-> snake_case. */
const TABLES: Readonly<Record<string, string>> = {
  projects: "projects",
  knowledgeSpaces: "knowledge_spaces",
  knowledgeCollections: "knowledge_collections",
  knowledgeNodes: "knowledge_nodes",
  sourceReferences: "source_references",
  evidenceReferences: "evidence_references",
  knowledgeProposals: "knowledge_proposals",
  proposalSources: "proposal_sources",
  proposalEvidence: "proposal_evidence",
  reviewDecisions: "review_decisions",
  reviewDecisionEvidence: "review_decision_evidence",
  knowledgeRevisions: "knowledge_revisions",
  revisionEvidence: "revision_evidence",
  currentRevisions: "current_revisions",
  rollbackEvents: "rollback_events",
  rollbackEventEvidence: "rollback_event_evidence",
  revisionRelationships: "revision_relationships",
  revisionRelationshipEvidence: "revision_relationship_evidence",
  crossProjectRelationshipProposals: "cross_project_relationship_proposals",
  crossProjectRelationshipProposalEvidence: "cross_project_relationship_proposal_evidence",
  crossProjectRelationshipReviewDecisions: "cross_project_relationship_review_decisions",
  crossProjectRelationshipReviewEvidence: "cross_project_relationship_review_evidence",
  crossProjectRelationships: "cross_project_relationships",
  crossProjectRelationshipEvidence: "cross_project_relationship_evidence",
  impactAssessments: "impact_assessments",
  impactAssessmentEvidence: "impact_assessment_evidence",
  plannedKnowledgeItems: "planned_knowledge_items",
  plannedKnowledgeNodes: "planned_knowledge_nodes",
  plannedKnowledgeEvidence: "planned_knowledge_evidence",
  plannedKnowledgeRevisions: "planned_knowledge_revisions",
  plannedKnowledgeRevisionNodes: "planned_knowledge_revision_nodes",
  plannedKnowledgeRevisionEvidence: "planned_knowledge_revision_evidence",
  plannedKnowledgeRevisionDecisions: "planned_knowledge_revision_decisions",
  plannedKnowledgeRevisionDecisionEvidence: "planned_knowledge_revision_decision_evidence",
  knowledgeNodeKeys: "knowledge_node_keys",
  missions: "missions",
  missionProjectReferences: "mission_project_references",
  missionKnowledgeReferences: "mission_knowledge_references",
  missionEvents: "mission_events",
  missionEventEvidence: "mission_event_evidence",
  missionAttentionRequests: "mission_attention_requests",
  missionOutcomes: "mission_outcomes",
  missionOutcomeProposals: "mission_outcome_proposals",
  missionLogReferences: "mission_log_references",
  chats: "chats",
  chatMessages: "chat_messages",
  chatMessageReferences: "chat_message_references",
  auditEvents: "audit_events",
  auditEventEvidence: "audit_event_evidence",
  navigationProjectionGenerations: "navigation_projection_generations",
  navigationProjectionState: "navigation_projection_state",
  navigationProjectionEntries: "navigation_projection_entries",
  navigationProjectionWarnings: "navigation_projection_warnings",
};

const ALL_SECTIONS = [...WORKSPACE_EXPORT_SECTIONS, ...WORKSPACE_EXPORT_DERIVED_SECTIONS];

export function exportColumnName(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export class SqliteWorkspaceExportStore implements WorkspaceExportStore {
  public constructor(private readonly database: DatabaseSync) {}

  public async readWorkspaceExport(): Promise<WorkspaceExport> {
    this.assertSchemaMatchesFormat();
    this.database.exec("BEGIN");
    try {
      const read = (specs: readonly WorkspaceExportSectionSpec[]) =>
        Object.fromEntries(specs.map((spec) => [spec.name, this.readSection(spec)]));
      const document: WorkspaceExport = {
        format: WORKSPACE_EXPORT_FORMAT,
        formatVersion: WORKSPACE_EXPORT_FORMAT_VERSION,
        sourceSchema: (
          this.database.prepare("SELECT id FROM schema_migrations ORDER BY id").all() as {
            id: string;
          }[]
        ).map((row) => row.id),
        sections: {
          ...read(WORKSPACE_EXPORT_SECTIONS),
          derived: read(WORKSPACE_EXPORT_DERIVED_SECTIONS),
        },
      };
      this.database.exec("COMMIT");
      return document;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Reads named canonical sections only, checking just their tables. The product UI uses it
   * for display labels, so it keeps working on a workspace that lacks a later migration.
   */
  public async readWorkspaceSections(
    names: readonly string[],
  ): Promise<Readonly<Record<string, readonly WorkspaceExportRecord[]>>> {
    const specs = names.map((name) => {
      const spec = WORKSPACE_EXPORT_SECTIONS.find((entry) => entry.name === name);
      if (!spec) throw new ValidationError(`Unknown export section ${name}`);
      return spec;
    });
    for (const spec of specs) this.assertTableMatches(spec);
    this.database.exec("BEGIN");
    try {
      const sections = Object.fromEntries(specs.map((spec) => [spec.name, this.readSection(spec)]));
      this.database.exec("COMMIT");
      return sections;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  public async restoreWorkspaceExport(document: WorkspaceExport): Promise<void> {
    assertWorkspaceExport(document);
    this.assertSchemaMatchesFormat();
    for (const spec of ALL_SECTIONS) {
      if (this.database.prepare(`SELECT 1 FROM ${table(spec)} LIMIT 1`).get() !== undefined) {
        throw new ValidationError("Restore target is not empty");
      }
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.exec("PRAGMA defer_foreign_keys = ON");
      for (const spec of WORKSPACE_EXPORT_SECTIONS) {
        this.insertSection(spec, workspaceExportRecords(document, spec));
      }
      for (const spec of WORKSPACE_EXPORT_DERIVED_SECTIONS) {
        this.insertSection(spec, workspaceExportRecords(document, spec, true));
      }
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw new IntegrityError(
        `Restore failed; no records were written. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private readSection(spec: WorkspaceExportSectionSpec): WorkspaceExportRecord[] {
    const columns = spec.fields.map(exportColumnName);
    const rows = this.database
      .prepare(
        `SELECT ${columns.join(", ")} FROM ${table(spec)} ORDER BY ${spec.key.map(exportColumnName).join(", ")}`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((row) =>
      Object.fromEntries(
        spec.fields.map((field) => {
          const value = row[exportColumnName(field)];
          if (value === null || typeof value === "string" || typeof value === "number") {
            return [field, value];
          }
          throw new IntegrityError(
            `Unsupported value type in ${table(spec)}.${exportColumnName(field)}`,
          );
        }),
      ),
    );
  }

  private insertSection(
    spec: WorkspaceExportSectionSpec,
    records: readonly WorkspaceExportRecord[],
  ): void {
    const columns = spec.fields.map(exportColumnName);
    const statement = this.database.prepare(
      `INSERT INTO ${table(spec)} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    );
    for (const record of records) {
      statement.run(...spec.fields.map((field) => (record[field] ?? null) as SQLInputValue));
    }
  }

  private assertTableMatches(spec: WorkspaceExportSectionSpec): void {
    const actual = (
      this.database.prepare(`PRAGMA table_info(${table(spec)})`).all() as { name: string }[]
    )
      .map((column) => column.name)
      .sort();
    const expected = spec.fields.map(exportColumnName).sort();
    if (actual.join(",") !== expected.join(",")) {
      throw new IntegrityError(
        `Table ${table(spec)} does not match export section ${spec.name}; update the export format`,
      );
    }
  }

  /** Fails loudly when a migration changed a table without a matching export format update. */
  private assertSchemaMatchesFormat(): void {
    for (const spec of ALL_SECTIONS) this.assertTableMatches(spec);
    const exported = new Set(ALL_SECTIONS.map(table));
    const unexported = (
      this.database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    )
      .map((row) => row.name)
      .filter((name) => name !== "schema_migrations" && !exported.has(name));
    if (unexported.length > 0) {
      throw new IntegrityError(`Tables missing from the export format: ${unexported.join(", ")}`);
    }
  }
}

function table(spec: WorkspaceExportSectionSpec): string {
  const name = TABLES[spec.name];
  if (!name) throw new IntegrityError(`No table mapped for export section ${spec.name}`);
  return name;
}
