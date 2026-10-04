import type { DatabaseSync } from "node:sqlite";
import {
  type AttentionOption,
  type AttentionRequest,
  type AttentionRequestId,
  type EvidenceReferenceId,
  type LogReference,
  type Mission,
  type MissionEvent,
  type MissionEventId,
  type MissionEventType,
  type MissionId,
  type MissionOutcome,
  type MissionReferences,
  type MissionState,
  type MissionStore,
  type NodeId,
  type PlannedKnowledgeId,
  type ProjectId,
  type ProjectQualifiedNodeId,
  type ProposalId,
  StaleMissionError,
  ValidationError,
  type WaitReason,
} from "@loxora/core";

type Row = Record<string, string | number | null>;
const frozen = <T>(value: T): T => Object.freeze(value);

export class SqliteMissionStore implements MissionStore {
  public constructor(private readonly database: DatabaseSync) {}

  public async createMission(input: {
    mission: Omit<Mission, "lastActivityAt" | "attentionRequest" | "outcome">;
    event: MissionEvent;
  }): Promise<void> {
    const { mission } = input;
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO missions (id,owner_project_id,title,goal,state,wait_reason,wait_detail,limited_capability,
           expected_resume_at,current_activity,worker_role,agent_metadata,predecessor_mission_id,created_by,
           created_at,updated_at,sequence) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          mission.id,
          mission.ownerProjectId,
          mission.title,
          mission.goal,
          mission.state,
          mission.waitReason,
          mission.waitDetail,
          mission.limitedCapability,
          mission.expectedResumeAt,
          mission.currentActivity,
          mission.workerRole,
          mission.agentMetadata,
          mission.predecessorMissionId,
          mission.createdBy,
          mission.createdAt,
          mission.updatedAt,
          mission.sequence,
        );
      const project = this.database.prepare(
        "INSERT INTO mission_project_references (mission_id,project_id) VALUES (?,?)",
      );
      for (const projectId of mission.references.projectIds) project.run(mission.id, projectId);
      const knowledge = this.database.prepare(
        "INSERT INTO mission_knowledge_references (mission_id,kind,project_id,target_id) VALUES (?,?,?,?)",
      );
      for (const node of mission.references.nodes)
        knowledge.run(mission.id, "Node", node.projectId, node.nodeId);
      for (const plan of mission.references.plans)
        knowledge.run(mission.id, "PlannedKnowledge", plan.projectId, plan.plannedKnowledgeId);
      this.insertEvent(input.event);
    });
  }

  public async applyMissionChange(
    input: Parameters<MissionStore["applyMissionChange"]>[0],
  ): Promise<void> {
    const { change } = input;
    this.transaction(() => {
      const updated = this.database
        .prepare(
          `UPDATE missions SET state=?,wait_reason=?,wait_detail=?,limited_capability=?,expected_resume_at=?,
           current_activity=?,updated_at=?,sequence=sequence+1 WHERE id=? AND sequence=?`,
        )
        .run(
          change.state,
          change.waitReason,
          change.waitDetail,
          change.limitedCapability,
          change.expectedResumeAt,
          change.currentActivity,
          change.updatedAt,
          input.missionId,
          input.expectedSequence,
        );
      if (Number(updated.changes) !== 1) {
        throw new StaleMissionError(
          `Mission ${input.missionId} changed concurrently; reload it and retry`,
        );
      }
      this.insertEvent(input.event);
      if (input.attentionRequest) this.insertAttentionRequest(input.attentionRequest);
      if (input.answer) {
        const answered = this.database
          .prepare(
            `UPDATE mission_attention_requests SET response=?,decision=?,responder_id=?,answered_at=?
             WHERE id=? AND answered_at IS NULL`,
          )
          .run(
            input.answer.response,
            input.answer.decision,
            input.answer.responderId,
            input.answer.answeredAt,
            input.answer.attentionRequestId,
          );
        if (Number(answered.changes) !== 1) {
          throw new ValidationError("The Attention Request was already answered");
        }
      }
      if (input.outcome) this.insertOutcome(input.missionId, input.outcome);
    });
  }

  public async getMission(input: { missionId: MissionId }): Promise<Mission | null> {
    const row = this.database.prepare("SELECT * FROM missions WHERE id=?").get(input.missionId) as
      | Row
      | undefined;
    return row ? this.mission(row) : null;
  }

  public async listMissions(input: {
    projectId?: ProjectId;
    states?: readonly MissionState[];
    waitReasons?: readonly WaitReason[];
  }): Promise<readonly Mission[]> {
    const rows = this.database
      .prepare(
        `SELECT * FROM missions WHERE (? IS NULL OR owner_project_id=? OR id IN
           (SELECT mission_id FROM mission_project_references WHERE project_id=?))
         ORDER BY updated_at DESC, id`,
      )
      .all(input.projectId ?? null, input.projectId ?? null, input.projectId ?? null) as Row[];
    return frozen(
      rows
        .map((row) => this.mission(row))
        .filter(
          (mission) =>
            (!input.states || input.states.includes(mission.state)) &&
            (!input.waitReasons ||
              (mission.waitReason !== null && input.waitReasons.includes(mission.waitReason))),
        ),
    );
  }

  public async getMissionEvents(input: { missionId: MissionId }): Promise<readonly MissionEvent[]> {
    const rows = this.database
      .prepare("SELECT * FROM mission_events WHERE mission_id=? ORDER BY sequence")
      .all(input.missionId) as Row[];
    return frozen(rows.map((row) => this.event(row)));
  }

  public async missingMissionReferences(
    input: Parameters<MissionStore["missingMissionReferences"]>[0],
  ): Promise<readonly string[]> {
    const missing: string[] = [];
    for (const projectId of input.projectIds) {
      if (!this.exists("SELECT 1 FROM projects WHERE id=?", projectId))
        missing.push(`Project ${projectId}`);
    }
    for (const node of input.nodes) {
      if (
        !this.exists(
          "SELECT 1 FROM knowledge_nodes WHERE id=? AND project_id=?",
          node.nodeId,
          node.projectId,
        )
      )
        missing.push(`Node ${node.nodeId}`);
    }
    for (const plan of input.plans) {
      if (
        !this.exists(
          "SELECT 1 FROM planned_knowledge_items WHERE id=? AND (owner_project_id=? OR related_project_id=?)",
          plan.plannedKnowledgeId,
          plan.projectId,
          plan.projectId,
        )
      )
        missing.push(`Plan ${plan.plannedKnowledgeId}`);
    }
    for (const proposal of input.proposals) {
      if (
        !this.exists(
          "SELECT 1 FROM knowledge_proposals WHERE id=? AND project_id=?",
          proposal.proposalId,
          proposal.projectId,
        )
      )
        missing.push(`Proposal ${proposal.proposalId}`);
    }
    return frozen(missing);
  }

  private mission(row: Row): Mission {
    const id = row.id as MissionId;
    const last = this.database
      .prepare(
        "SELECT occurred_at FROM mission_events WHERE mission_id=? ORDER BY sequence DESC LIMIT 1",
      )
      .get(id) as Row | undefined;
    return frozen({
      id,
      ownerProjectId: row.owner_project_id as ProjectId,
      title: row.title as string,
      goal: row.goal as string,
      state: row.state as MissionState,
      waitReason: (row.wait_reason as WaitReason | null) ?? null,
      waitDetail: (row.wait_detail as string | null) ?? null,
      limitedCapability: (row.limited_capability as string | null) ?? null,
      expectedResumeAt: (row.expected_resume_at as string | null) ?? null,
      currentActivity: (row.current_activity as string | null) ?? null,
      workerRole: (row.worker_role as string | null) ?? null,
      agentMetadata: (row.agent_metadata as string | null) ?? null,
      predecessorMissionId: (row.predecessor_mission_id as MissionId | null) ?? null,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      sequence: Number(row.sequence),
      lastActivityAt: (last?.occurred_at as string | undefined) ?? (row.updated_at as string),
      references: this.references(id),
      attentionRequest: row.state === "waiting" ? this.currentAttentionRequest(id) : null,
      outcome: this.outcome(id),
    });
  }

  private references(id: MissionId): MissionReferences {
    const projectIds = (
      this.database
        .prepare(
          "SELECT project_id FROM mission_project_references WHERE mission_id=? ORDER BY project_id",
        )
        .all(id) as Row[]
    ).map((row) => row.project_id as ProjectId);
    const knowledge = this.database
      .prepare(
        "SELECT kind,project_id,target_id FROM mission_knowledge_references WHERE mission_id=? ORDER BY kind,project_id,target_id",
      )
      .all(id) as Row[];
    return frozen({
      projectIds: frozen(projectIds),
      nodes: frozen(
        knowledge
          .filter((row) => row.kind === "Node")
          .map(
            (row): ProjectQualifiedNodeId =>
              frozen({ projectId: row.project_id as ProjectId, nodeId: row.target_id as NodeId }),
          ),
      ),
      plans: frozen(
        knowledge
          .filter((row) => row.kind === "PlannedKnowledge")
          .map((row) =>
            frozen({
              projectId: row.project_id as ProjectId,
              plannedKnowledgeId: row.target_id as PlannedKnowledgeId,
            }),
          ),
      ),
    });
  }

  /** The Attention Request created by the Waiting event that started the current wait. */
  private currentAttentionRequest(id: MissionId): AttentionRequest | null {
    const row = this.database
      .prepare(
        `SELECT a.* FROM mission_attention_requests a JOIN mission_events e ON e.id=a.event_id
         WHERE a.mission_id=? AND e.sequence=(SELECT MAX(sequence) FROM mission_events
           WHERE mission_id=? AND event_type='Waiting')`,
      )
      .get(id, id) as Row | undefined;
    if (!row) return null;
    return frozen({
      id: row.id as AttentionRequestId,
      missionId: row.mission_id as MissionId,
      eventId: row.event_id as MissionEventId,
      waitReason: row.wait_reason as AttentionRequest["waitReason"],
      question: row.question as string,
      rationale: row.rationale as string,
      options: frozen(JSON.parse(row.options_json as string) as AttentionOption[]),
      response: (row.response as string | null) ?? null,
      decision: (row.decision as "approve" | "reject" | null) ?? null,
      responderId: (row.responder_id as string | null) ?? null,
      answeredAt: (row.answered_at as string | null) ?? null,
    });
  }

  private outcome(id: MissionId): MissionOutcome | null {
    const row = this.database
      .prepare("SELECT * FROM mission_outcomes WHERE mission_id=?")
      .get(id) as Row | undefined;
    if (!row) return null;
    const proposals = (
      this.database
        .prepare(
          `SELECT o.project_id,o.proposal_id,p.status FROM mission_outcome_proposals o
           JOIN knowledge_proposals p ON p.id=o.proposal_id AND p.project_id=o.project_id
           WHERE o.mission_id=? ORDER BY o.proposal_id`,
        )
        .all(id) as Row[]
    ).map((entry) =>
      frozen({
        projectId: entry.project_id as ProjectId,
        proposalId: entry.proposal_id as ProposalId,
        status: entry.status as string,
      }),
    );
    const logReferences = (
      this.database
        .prepare(
          "SELECT kind,locator FROM mission_log_references WHERE mission_id=? ORDER BY position",
        )
        .all(id) as Row[]
    ).map(
      (entry): LogReference =>
        frozen({
          kind: entry.kind as LogReference["kind"],
          locator: entry.locator as string,
          portable: entry.kind === "workspace",
        }),
    );
    return frozen({
      kind: row.kind as MissionOutcome["kind"],
      summary: row.summary as string,
      outputs: frozen(JSON.parse(row.outputs_json as string) as string[]),
      validations: frozen(JSON.parse(row.validations_json as string) as string[]),
      decisions: frozen(JSON.parse(row.decisions_json as string) as string[]),
      proposals: frozen(proposals),
      logReferences: frozen(logReferences),
      recordedBy: row.recorded_by as string,
      recordedAt: row.recorded_at as string,
    });
  }

  private event(row: Row): MissionEvent {
    const evidence = (
      this.database
        .prepare(
          "SELECT evidence_project_id,evidence_reference_id FROM mission_event_evidence WHERE event_id=? ORDER BY evidence_project_id,evidence_reference_id",
        )
        .all(row.id as string) as Row[]
    ).map((entry) =>
      frozen({
        projectId: entry.evidence_project_id as ProjectId,
        evidenceReferenceId: entry.evidence_reference_id as EvidenceReferenceId,
      }),
    );
    return frozen({
      id: row.id as MissionEventId,
      missionId: row.mission_id as MissionId,
      sequence: Number(row.sequence),
      type: row.event_type as MissionEventType,
      previousState: (row.previous_state as MissionState | null) ?? null,
      newState: row.new_state as MissionState,
      waitReason: (row.wait_reason as WaitReason | null) ?? null,
      actorId: row.actor_id as string,
      occurredAt: row.occurred_at as string,
      reason: (row.reason as string | null) ?? null,
      payload: frozen(JSON.parse(row.payload_json as string) as Record<string, unknown>),
      evidence: frozen(evidence),
    });
  }

  private insertEvent(event: MissionEvent): void {
    this.database
      .prepare(
        `INSERT INTO mission_events (id,mission_id,sequence,event_type,previous_state,new_state,wait_reason,
         actor_id,occurred_at,reason,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        event.id,
        event.missionId,
        event.sequence,
        event.type,
        event.previousState,
        event.newState,
        event.waitReason,
        event.actorId,
        event.occurredAt,
        event.reason,
        JSON.stringify(event.payload),
      );
    const evidence = this.database.prepare(
      "INSERT INTO mission_event_evidence (event_id,evidence_project_id,evidence_reference_id) VALUES (?,?,?)",
    );
    for (const entry of event.evidence)
      evidence.run(event.id, entry.projectId, entry.evidenceReferenceId);
  }

  private insertAttentionRequest(request: AttentionRequest): void {
    this.database
      .prepare(
        `INSERT INTO mission_attention_requests (id,mission_id,event_id,wait_reason,question,rationale,options_json,
         response,decision,responder_id,answered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        request.id,
        request.missionId,
        request.eventId,
        request.waitReason,
        request.question,
        request.rationale,
        JSON.stringify(request.options),
        request.response,
        request.decision,
        request.responderId,
        request.answeredAt,
      );
  }

  private insertOutcome(
    missionId: MissionId,
    outcome: NonNullable<Parameters<MissionStore["applyMissionChange"]>[0]["outcome"]>,
  ): void {
    this.database
      .prepare(
        `INSERT INTO mission_outcomes (mission_id,kind,summary,outputs_json,validations_json,decisions_json,
         recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        missionId,
        outcome.kind,
        outcome.summary,
        JSON.stringify(outcome.outputs),
        JSON.stringify(outcome.validations),
        JSON.stringify(outcome.decisions),
        outcome.recordedBy,
        outcome.recordedAt,
      );
    const proposal = this.database.prepare(
      "INSERT INTO mission_outcome_proposals (mission_id,project_id,proposal_id) VALUES (?,?,?)",
    );
    for (const entry of outcome.proposals)
      proposal.run(missionId, entry.projectId, entry.proposalId);
    const log = this.database.prepare(
      "INSERT INTO mission_log_references (mission_id,position,kind,locator) VALUES (?,?,?,?)",
    );
    for (const [index, reference] of outcome.logReferences.entries()) {
      log.run(missionId, index + 1, reference.kind, reference.locator);
    }
  }

  private exists(sql: string, ...values: string[]): boolean {
    return this.database.prepare(sql).get(...values) !== undefined;
  }

  private transaction(work: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      work();
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
