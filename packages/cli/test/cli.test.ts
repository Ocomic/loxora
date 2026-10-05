import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCli } from "../src/cli.js";
import { settingsPath, writeSettings } from "../src/settings.js";
import { resolveWorkspaceDirectory } from "../src/workspace.js";

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function harness(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "loxora-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env: Record<string, string> = { LOXORA_HOME: join(root, "home") };
  async function run(...argv: string[]): Promise<Run> {
    let stdout = "";
    let stderr = "";
    const code = await runCli(argv, {
      env,
      cwd: root,
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
    });
    return { code, stdout, stderr };
  }
  async function json(...argv: string[]): Promise<Record<string, unknown>> {
    const result = await run(...argv, "--json");
    assert.equal(result.code, 0, `${argv.join(" ")} failed: ${result.stderr}`);
    return JSON.parse(result.stdout) as Record<string, unknown>;
  }
  return { root, env, run, json };
}

async function seedProject(
  cli: ReturnType<typeof harness>,
  name: string,
  nodeTitle: string,
  nodeContent: string,
) {
  await cli.json("project", "add", "--name", name, "--actor", "agent:test");
  await cli.json(
    "space",
    "add",
    "--project",
    name,
    "--name",
    "Architecture",
    "--actor",
    "agent:test",
  );
  await cli.json(
    "collection",
    "add",
    "--project",
    name,
    "--space",
    "Architecture",
    "--name",
    "Contracts",
    "--actor",
    "agent:test",
  );
  await cli.json(
    "source",
    "add",
    "--project",
    name,
    "--locator",
    `git:example/${name}@abc1234:docs/decisions.md`,
    "--title",
    `${name} decisions`,
    "--actor",
    "agent:test",
  );
  const evidence = await cli.json(
    "evidence",
    "add",
    "--project",
    name,
    "--source",
    `${name} decisions`,
    "--summary",
    `${name} evidence`,
    "--locator",
    "#D-001",
    "--actor",
    "agent:test",
  );
  const proposal = await cli.json(
    "propose",
    "new",
    "--project",
    name,
    "--space",
    "Architecture",
    "--collection",
    "Contracts",
    "--title",
    nodeTitle,
    "--content",
    nodeContent,
    "--source",
    `${name} decisions`,
    "--evidence",
    String(evidence.id),
    "--actor",
    "agent:test",
  );
  await cli.json(
    "review",
    "--proposal",
    String(proposal.id),
    "--decision",
    "accept",
    "--reason",
    "verified",
    "--evidence",
    String(evidence.id),
    "--actor",
    "Ocomic",
  );
  return { evidenceId: String(evidence.id), proposalId: String(proposal.id) };
}

test("workspace init uses the home default and requires a reviewer", async (t) => {
  const cli = harness(t);
  const missing = await cli.run("workspace", "init");
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /at least one reviewer/);
  const agentReviewer = await cli.run("workspace", "init", "--reviewer", "agent:bot");
  assert.equal(agentReviewer.code, 2);
  const created = await cli.json("workspace", "init", "--reviewer", "Ocomic", "--name", "lab");
  assert.equal(
    created.directory,
    join(cli.env.LOXORA_HOME ?? "", ".loxora", "workspaces", "default"),
  );
  const again = await cli.run("workspace", "init", "--reviewer", "Ocomic");
  assert.equal(again.code, 2);
  const status = await cli.json("workspace", "status");
  assert.deepEqual(status.projects, []);
});

test("the app settings file is resolution step 3, after --workspace and LOXORA_WORKSPACE", async (t) => {
  const cli = harness(t);
  const settings = join(cli.env.LOXORA_HOME ?? "", ".loxora", "settings.json");
  assert.equal(settingsPath(cli.env), settings);
  assert.equal(
    settingsPath({ APPDATA: "C:\\Users\\alex\\AppData\\Roaming" }, "win32"),
    join("C:\\Users\\alex\\AppData\\Roaming", "Loxora", "settings.json"),
  );
  assert.equal(
    settingsPath({ XDG_CONFIG_HOME: "/cfg" }, "linux"),
    join("/cfg", "loxora", "settings.json"),
  );
  const logbook = join(cli.root, "Documents", "Loxora");
  writeSettings(settings, { configVersion: 1, workspacePath: logbook });
  const created = await cli.json("workspace", "init", "--reviewer", "alex", "--name", "Nova");
  assert.equal(created.directory, logbook);
  assert.equal(resolveWorkspaceDirectory(undefined, cli.env), logbook);
  const explicit = join(cli.root, "explicit");
  assert.equal(resolveWorkspaceDirectory(explicit, cli.env), explicit);
  assert.equal(
    resolveWorkspaceDirectory(undefined, { ...cli.env, LOXORA_WORKSPACE: explicit }),
    explicit,
  );
  writeSettings(settings, { configVersion: 1 });
  assert.equal(
    resolveWorkspaceDirectory(undefined, cli.env),
    join(cli.env.LOXORA_HOME ?? "", ".loxora", "workspaces", "default"),
  );
  writeFileSync(settings, "{ broken", "utf8");
  const broken = await cli.run("workspace", "status");
  assert.equal(broken.code, 2);
  assert.match(broken.stderr, /not valid JSON\. Fix the file or pass --workspace/);
  assert.equal(readFileSync(settings, "utf8"), "{ broken");
});

test("workspace init refuses a Git working tree unless explicitly allowed", async (t) => {
  const cli = harness(t);
  const repository = join(cli.root, "repo");
  mkdirSync(join(repository, ".git"), { recursive: true });
  const refused = await cli.run(
    "workspace",
    "init",
    "--reviewer",
    "Ocomic",
    "--workspace",
    join(repository, ".loxora"),
  );
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /Git working tree/);
  const allowed = await cli.run(
    "workspace",
    "init",
    "--reviewer",
    "Ocomic",
    "--workspace",
    join(repository, ".loxora"),
    "--allow-in-repository",
  );
  assert.equal(allowed.code, 0);
});

test("commands fail clearly without a workspace, an actor, or a known command", async (t) => {
  const cli = harness(t);
  const noWorkspace = await cli.run("workspace", "status");
  assert.equal(noWorkspace.code, 2);
  assert.match(noWorkspace.stderr, /No workspace/);
  await cli.json("workspace", "init", "--reviewer", "Ocomic");
  const noActor = await cli.run("project", "add", "--name", "x");
  assert.equal(noActor.code, 2);
  assert.match(noActor.stderr, /--actor/);
  const unknown = await cli.run("frobnicate");
  assert.equal(unknown.code, 2);
  const badFlag = await cli.run("workspace", "status", "--nope");
  assert.equal(badFlag.code, 2);
  const help = await cli.run("--help");
  assert.equal(help.code, 0);
  assert.match(help.stdout, /propose new/);
});

test("knowledge is proposed by agents and becomes current only after reviewer acceptance", async (t) => {
  const cli = harness(t);
  await cli.json("workspace", "init", "--reviewer", "Ocomic");
  cli.env.LOXORA_ACTOR = "agent:test";
  await cli.json("project", "add", "--name", "asset-poc");
  await cli.json("space", "add", "--project", "asset-poc", "--name", "Decisions");
  await cli.json(
    "collection",
    "add",
    "--project",
    "asset-poc",
    "--space",
    "Decisions",
    "--name",
    "Pipeline",
  );
  await cli.json(
    "source",
    "add",
    "--project",
    "asset-poc",
    "--locator",
    "git:example/asset-poc@abc1234:docs/DECISION-LOG.md",
    "--title",
    "Decision log",
  );
  const evidence = await cli.json(
    "evidence",
    "add",
    "--project",
    "asset-poc",
    "--source",
    "Decision log",
    "--summary",
    "D-003",
    "--locator",
    "#D-003",
  );
  const contentFile = join(cli.root, "d003.md");
  writeFileSync(contentFile, "Blender performs cleanup and GLB export.\n");
  const proposal = await cli.json(
    "propose",
    "new",
    "--project",
    "asset-poc",
    "--space",
    "Decisions",
    "--collection",
    "Pipeline",
    "--title",
    "Blender is the game-ready stage",
    "--content-file",
    "d003.md",
    "--source",
    "Decision log",
    "--evidence",
    String(evidence.id).slice(0, 8),
  );
  const inbox = (await cli.json("inbox")) as unknown as unknown[];
  assert.equal(inbox.length, 1);
  const noCurrent = await cli.run(
    "show",
    "current",
    "--project",
    "asset-poc",
    "--node",
    "Blender is the game-ready stage",
  );
  assert.equal(noCurrent.code, 2);
  assert.match(noCurrent.stderr, /no accepted knowledge yet; proposal .* is awaiting review/);

  const byAgent = await cli.run(
    "review",
    "--proposal",
    String(proposal.id),
    "--decision",
    "accept",
    "--reason",
    "self",
    "--evidence",
    String(evidence.id),
  );
  assert.equal(byAgent.code, 2);
  assert.match(byAgent.stderr, /not a reviewer/);
  const byStranger = await cli.run(
    "review",
    "--proposal",
    String(proposal.id),
    "--decision",
    "accept",
    "--reason",
    "x",
    "--evidence",
    String(evidence.id),
    "--actor",
    "someone",
  );
  assert.equal(byStranger.code, 2);

  const accepted = await cli.json(
    "review",
    "--proposal",
    String(proposal.id).slice(0, 8),
    "--decision",
    "accept",
    "--reason",
    "Matches D-003",
    "--evidence",
    String(evidence.id),
    "--actor",
    "Ocomic",
  );
  assert.ok(accepted.revision);
  const current = await cli.json(
    "show",
    "current",
    "--project",
    "asset-poc",
    "--node",
    "Blender is the game-ready stage",
  );
  assert.equal(
    (current.revision as Record<string, unknown>).content,
    "Blender performs cleanup and GLB export.",
  );
  const map = await cli.run("show", "map", "--project", "asset-poc");
  assert.match(map.stdout, /Blender is the game-ready stage \[current/);
  const mapJson = await cli.json("show", "map", "--project", "asset-poc");
  assert.equal(mapJson.currentNodeCount, 1);

  const successor = await cli.json(
    "propose",
    "successor",
    "--project",
    "asset-poc",
    "--node",
    "Blender is the game-ready stage",
    "--content",
    "Blender performs cleanup, LOD generation, and GLB export.",
    "--reason",
    "Phase 2 adds LODs",
    "--source",
    "Decision log",
    "--evidence",
    String(evidence.id),
  );
  await cli.json(
    "review",
    "--proposal",
    String(successor.id),
    "--decision",
    "accept",
    "--reason",
    "LODs confirmed",
    "--evidence",
    String(evidence.id),
    "--actor",
    "Ocomic",
  );
  const history = await cli.json(
    "show",
    "history",
    "--project",
    "asset-poc",
    "--node",
    "Blender is the game-ready stage",
  );
  assert.equal((history.entries as unknown[]).length, 2);
  const historyText = await cli.run(
    "show",
    "history",
    "--project",
    "asset-poc",
    "--node",
    "Blender is the game-ready stage",
  );
  assert.match(historyText.stdout, /CURRENT/);
  assert.match(historyText.stdout, /historical/);
});

test("rejected proposals stay out of current knowledge", async (t) => {
  const cli = harness(t);
  await cli.json("workspace", "init", "--reviewer", "Ocomic");
  const { evidenceId } = await seedProject(cli, "alpha", "Token format", "V1");
  const rejected = await cli.json(
    "propose",
    "successor",
    "--project",
    "alpha",
    "--node",
    "Token format",
    "--content",
    "V2",
    "--reason",
    "try V2",
    "--source",
    "alpha decisions",
    "--evidence",
    evidenceId,
    "--actor",
    "agent:test",
  );
  const result = await cli.json(
    "review",
    "--proposal",
    String(rejected.id),
    "--decision",
    "reject",
    "--reason",
    "breaks consumers",
    "--evidence",
    evidenceId,
    "--actor",
    "Ocomic",
  );
  assert.equal(result.revision, null);
  const current = await cli.json("show", "current", "--project", "alpha", "--node", "Token format");
  assert.equal((current.revision as Record<string, unknown>).content, "V1");
});

test("cross-project dependencies, plans, and context use reviewed knowledge across projects", async (t) => {
  const cli = harness(t);
  await cli.json("workspace", "init", "--reviewer", "Ocomic");
  const consumer = await seedProject(cli, "game", "Runtime asset contract", "Loads GLB files");
  const provider = await seedProject(cli, "asset-poc", "GLB export", "Exports GLB with PBR");
  const relation = await cli.json(
    "relate",
    "propose",
    "--from-project",
    "game",
    "--from-node",
    "Runtime asset contract",
    "--to-project",
    "asset-poc",
    "--to-node",
    "GLB export",
    "--evidence",
    consumer.evidenceId,
    "--reason",
    "game loads assets produced by the PoC",
    "--confidence",
    "High",
    "--actor",
    "agent:test",
  );
  const byAgent = await cli.run(
    "relate",
    "review",
    "--proposal",
    String(relation.id),
    "--decision",
    "accept",
    "--reason",
    "x",
    "--evidence",
    consumer.evidenceId,
    "--actor",
    "agent:test",
  );
  assert.equal(byAgent.code, 2);
  const accepted = await cli.json(
    "relate",
    "review",
    "--proposal",
    String(relation.id),
    "--decision",
    "accept",
    "--reason",
    "confirmed",
    "--evidence",
    provider.evidenceId,
    "--actor",
    "Ocomic",
  );
  assert.ok(accepted.relationship);
  const map = await cli.json("show", "map", "--project", "game");
  assert.equal((map.outgoingDependencies as unknown[]).length, 1);

  await cli.json(
    "plan",
    "add",
    "--project",
    "asset-poc",
    "--title",
    "Automate LOD generation",
    "--description",
    "Phase 2 Blender batch",
    "--status",
    "Proposed",
    "--reason",
    "Roadmap phase 2",
    "--blocking-condition",
    "Phase 1 quality PoC is complete",
    "--node",
    "GLB export",
    "--related-project",
    "game",
    "--related-node",
    "Runtime asset contract",
    "--evidence",
    provider.evidenceId,
    "--actor",
    "agent:test",
  );
  const plans = await cli.run("show", "plans", "--project", "asset-poc");
  assert.match(plans.stdout, /not canonical knowledge[\s\S]*not yet done/);
  assert.match(plans.stdout, /\[Proposed\] Automate LOD generation/);
  const badStatus = await cli.run(
    "plan",
    "add",
    "--project",
    "asset-poc",
    "--title",
    "x",
    "--description",
    "x",
    "--status",
    "Done",
    "--reason",
    "x",
    "--blocking-condition",
    "x",
    "--actor",
    "agent:test",
  );
  assert.equal(badStatus.code, 2);
  assert.match(badStatus.stderr, /--status must be one of/);

  const context = await cli.json(
    "context",
    "--project",
    "game",
    "--node",
    "Runtime asset contract",
    "--include-related",
  );
  assert.equal(typeof context.fingerprint, "string");
  assert.match(JSON.stringify(context), /Exports GLB with PBR/);
});

test("export and export verify round-trip the workspace", async (t) => {
  const cli = harness(t);
  await cli.json("workspace", "init", "--reviewer", "Ocomic");
  await seedProject(cli, "alpha", "Token format", "V1");
  const exported = await cli.json("export", "--out", "backup/workspace.json");
  const text = readFileSync(String(exported.path), "utf8");
  assert.match(text, /"format": "loxora.workspace-export"/);
  const verified = await cli.json("export", "verify", "--in", "backup/workspace.json");
  assert.equal(verified.identical, true);
  assert.equal(verified.sha256, exported.sha256);
});

test("ambiguous and unknown references are rejected with guidance", async (t) => {
  const cli = harness(t);
  await cli.json("workspace", "init", "--reviewer", "Ocomic");
  await cli.json("project", "add", "--name", "dup", "--actor", "agent:test");
  await cli.json("project", "add", "--name", "dup", "--actor", "agent:test");
  const ambiguous = await cli.run("show", "map", "--project", "dup");
  assert.equal(ambiguous.code, 2);
  assert.match(ambiguous.stderr, /ambiguous/);
  const unknown = await cli.run("show", "map", "--project", "nope", "--json");
  assert.equal(unknown.code, 2);
  assert.equal(
    (JSON.parse(unknown.stdout) as { error: { kind: string } }).error.kind,
    "CliUsageError",
  );
});

test("Milestone 9: keys, plan revisions, reviewer-gated closing, inbox, help, and defaults", async (t) => {
  const cli = harness(t);
  await cli.json("workspace", "init", "--reviewer", "Ocomic");
  const { evidenceId } = await seedProject(cli, "poc", "Baseline", "Accepted baseline");
  const keyed = await cli.json(
    "propose",
    "new",
    "--project",
    "poc",
    "--space",
    "Architecture",
    "--collection",
    "Contracts",
    "--title",
    "Hardware first",
    "--content",
    "Validate hardware before UI",
    "--source",
    "poc decisions",
    "--evidence",
    evidenceId,
    "--key",
    "D-001",
    "--actor",
    "agent:test",
  );
  assert.equal((keyed.nodeKey as { key: string }).key, "D-001");
  const duplicate = await cli.run(
    "propose",
    "new",
    "--project",
    "poc",
    "--space",
    "Architecture",
    "--collection",
    "Contracts",
    "--title",
    "Other",
    "--content",
    "x",
    "--evidence",
    evidenceId,
    "--key",
    "d-001",
    "--actor",
    "agent:test",
  );
  assert.equal(duplicate.code, 2);
  assert.match(duplicate.stderr, /already used/);

  const inbox = await cli.run("inbox");
  assert.match(inbox.stdout, /"Hardware first" \[D-001\] in poc \(Initial\) by agent:test/);
  const map = await cli.run("show", "map", "--project", "poc");
  assert.match(map.stdout, /\[D-001\] Hardware first \[pending review\]/);
  assert.match(map.stdout, /1 proposal awaiting review/);
  const pendingLink = await cli.run(
    "plan",
    "add",
    "--project",
    "poc",
    "--title",
    "Phase 1",
    "--description",
    "Smoke test",
    "--status",
    "Ready",
    "--reason",
    "Roadmap",
    "--blocking-condition",
    "None",
    "--node",
    "D-001",
    "--actor",
    "agent:test",
  );
  assert.equal(pendingLink.code, 2);
  assert.match(pendingLink.stderr, /no accepted knowledge yet/);

  const reviewed = await cli.run(
    "review",
    "--proposal",
    String(keyed.id),
    "--decision",
    "accept",
    "--reason",
    "ok",
    "--actor",
    "Ocomic",
  );
  assert.equal(reviewed.code, 0, reviewed.stderr);
  assert.match(reviewed.stdout, /Evidence: .* \(from the proposal\)/);
  assert.match(
    (await cli.run("show", "current", "--project", "poc", "--node", "d-001")).stdout,
    /Validate hardware/,
  );

  await cli.json(
    "plan",
    "add",
    "--project",
    "poc",
    "--title",
    "Phase 1",
    "--description",
    "Smoke test",
    "--status",
    "Ready",
    "--reason",
    "Roadmap",
    "--blocking-condition",
    "None",
    "--actor",
    "agent:test",
  );
  const linked = await cli.run(
    "plan",
    "update",
    "--plan",
    "Phase 1",
    "--project",
    "poc",
    "--status",
    "InProgress",
    "--add-node",
    "D-001",
    "--reason",
    "Started; link decision",
    "--actor",
    "agent:test",
  );
  assert.equal(linked.code, 0, linked.stderr);
  assert.match(linked.stdout, /revision 2 \(InProgress\); changed: status, relatedNodes/);

  const closing = await cli.run(
    "plan",
    "update",
    "--plan",
    "Phase 1",
    "--status",
    "Completed",
    "--reason",
    "Done from my side",
    "--actor",
    "agent:test",
  );
  assert.equal(closing.code, 0, closing.stderr);
  assert.match(closing.stdout, /Plan revision proposal \S+ submitted/);
  const planInbox = await cli.run("inbox");
  assert.match(
    planInbox.stdout,
    /plan revision \S+: "Phase 1" InProgress -> Completed \(changed: status\) by agent:test/,
  );
  const proposalId = /plan revision (\S+):/.exec(planInbox.stdout)?.[1] ?? "";
  const agentReview = await cli.run(
    "review",
    "--proposal",
    proposalId,
    "--decision",
    "accept",
    "--reason",
    "self",
    "--actor",
    "agent:test",
  );
  assert.equal(agentReview.code, 2);
  const accepted = await cli.run(
    "review",
    "--proposal",
    proposalId.slice(0, 8),
    "--decision",
    "accept",
    "--reason",
    "verified",
    "--actor",
    "Ocomic",
  );
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.match(accepted.stdout, /plan "Phase 1" is now revision 3 \(Completed\)/);

  const plans = await cli.run("show", "plans", "--project", "poc");
  assert.match(plans.stdout, /\[Completed\] Phase 1 r3 .* — closed/);
  assert.doesNotMatch(plans.stdout, /not implemented/);
  const history = await cli.run("plan", "history", "--plan", "Phase 1");
  assert.match(history.stdout, /- r1 .*\[Ready\].*\(created\)/);
  assert.match(
    history.stdout,
    /- proposal \S+ .*\[Completed\] by agent:test: Done from my side — Accepted by Ocomic/,
  );
  assert.match(history.stdout, /- r3 EFFECTIVE/);

  const agentKey = await cli.run(
    "node",
    "key",
    "--project",
    "poc",
    "--node",
    "Baseline",
    "--key",
    "D-000",
    "--actor",
    "agent:test",
  );
  assert.equal(agentKey.code, 2);
  assert.match(agentKey.stderr, /need a reviewer/);
  const reviewerKey = await cli.run(
    "node",
    "key",
    "--project",
    "poc",
    "--node",
    "Baseline",
    "--key",
    "D-000",
    "--actor",
    "Ocomic",
  );
  assert.equal(reviewerKey.code, 0, reviewerKey.stderr);

  const status = await cli.run("workspace", "status");
  assert.match(
    status.stdout,
    /poc \(\w+\): 2 nodes with accepted knowledge, 0 pending nodes, 0 pending proposals; plans: 1 Completed/,
  );
  const help = await cli.run("plan", "update", "--help");
  assert.equal(help.code, 0);
  assert.match(help.stdout, /plan update --plan/);
  assert.doesNotMatch(help.stdout, /workspace init/);
  assert.match((await cli.run("help", "node", "key")).stdout, /node key --project/);
});

test("export verify accepts a version 1 backup and reports the upgrade", async (t) => {
  const cli = harness(t);
  await cli.json("workspace", "init", "--reviewer", "Ocomic");
  await seedProject(cli, "legacy", "Contract", "Accepted");
  const out = join(cli.root, "current.json");
  await cli.json("export", "--out", out);
  const document = JSON.parse(readFileSync(out, "utf8"));
  document.formatVersion = 1;
  document.sourceSchema = document.sourceSchema.filter(
    (id: string) => id !== "006_plan_revisions_node_keys" && id !== "007_missions",
  );
  for (const name of [
    "plannedKnowledgeRevisions",
    "plannedKnowledgeRevisionNodes",
    "plannedKnowledgeRevisionEvidence",
    "plannedKnowledgeRevisionDecisions",
    "plannedKnowledgeRevisionDecisionEvidence",
    "knowledgeNodeKeys",
    "missions",
    "missionProjectReferences",
    "missionKnowledgeReferences",
    "missionEvents",
    "missionEventEvidence",
    "missionAttentionRequests",
    "missionOutcomes",
    "missionOutcomeProposals",
    "missionLogReferences",
  ]) {
    delete document.sections[name];
  }
  const legacy = join(cli.root, "legacy-v1.json");
  writeFileSync(legacy, `${JSON.stringify(document, null, 2)}\n`);
  const verified = await cli.run("export", "verify", "--in", legacy);
  assert.equal(verified.code, 0, verified.stderr);
  assert.match(
    verified.stdout,
    /identical after upgrade to format version 3 \(restored store adds migrations: 006_plan_revisions_node_keys, 007_missions\)/,
  );
});

test("Milestone 10: missions from creation to outcome, with human-only answers", async (t) => {
  const cli = harness(t);
  await cli.json("workspace", "init", "--reviewer", "Ocomic");
  const { proposalId } = await seedProject(
    cli,
    "game",
    "GLB contract",
    "GLB with embedded textures",
  );
  const agent = ["--actor", "agent:codex"] as const;
  const created = await cli.json(
    "mission",
    "create",
    "--project",
    "game",
    "--title",
    "Export barrel LODs",
    "--goal",
    "LOD0-LOD2 GLBs",
    "--node",
    "GLB contract",
    "--role",
    "Asset Worker",
    ...agent,
  );
  assert.equal(created.state, "queued");
  const id = String(created.id);
  assert.equal(
    (
      await cli.json(
        "mission",
        "start",
        "--mission",
        "Export barrel LODs",
        "--activity",
        "LOD1",
        ...agent,
      )
    ).state,
    "running",
  );
  const limited = await cli.run(
    "mission",
    "wait",
    "--mission",
    id.slice(0, 8),
    "--reason",
    "provider_limit",
    "--detail",
    "Usage limit reached",
    "--capability",
    "coding agent",
    "--expected-resume",
    "2026-10-04T08:00:00Z",
    ...agent,
  );
  assert.equal(limited.code, 0, limited.stderr);
  assert.match(limited.stdout, /waiting: provider_limit/);
  const shownLimit = await cli.run("mission", "show", "--mission", id);
  assert.match(shownLimit.stdout, /Paused by a provider limit — the Mission has not failed/);
  assert.match(shownLimit.stdout, /nothing resumes automatically/);
  await cli.json("mission", "resume", "--mission", id, ...agent);
  const budget = await cli.run(
    "mission",
    "wait",
    "--mission",
    id,
    "--reason",
    "needs_budget",
    ...agent,
  );
  assert.equal(budget.code, 2);
  assert.match(budget.stderr, /reserved/);
  await cli.json(
    "mission",
    "wait",
    "--mission",
    id,
    "--reason",
    "needs_input",
    "--question",
    "Texture size for LOD2?",
    "--why",
    "Both fit the budget",
    "--option",
    "512",
    "--consequence",
    "smaller download",
    "--option",
    "1024",
    ...agent,
  );
  const attention = await cli.run("mission", "list", "--attention");
  assert.match(
    attention.stdout,
    /\[waiting: needs_input\] Export barrel LODs .* needs you: Texture size for LOD2\?/,
  );
  const agentAnswer = await cli.run(
    "mission",
    "answer",
    "--mission",
    id,
    "--response",
    "512",
    ...agent,
  );
  assert.equal(agentAnswer.code, 2);
  assert.match(agentAnswer.stderr, /Only a human/);
  const early = await cli.run("mission", "resume", "--mission", id, ...agent);
  assert.equal(early.code, 2);
  await cli.json("mission", "answer", "--mission", id, "--response", "512", "--actor", "Ocomic");
  await cli.json("mission", "resume", "--mission", id, ...agent);
  await cli.json("mission", "activity", "--mission", id, "--text", "Exporting LOD2", ...agent);
  const completed = await cli.run(
    "mission",
    "complete",
    "--mission",
    id,
    "--summary",
    "Three LODs exported",
    "--output",
    "barrel_lod0.glb",
    "--validation",
    "inspect-glb passes",
    "--decision",
    "LOD2 uses 512",
    "--proposal",
    proposalId,
    "--log",
    "workspace:logs/lod.txt",
    "--log",
    "external:C:/agent/run.log",
    ...agent,
  );
  assert.equal(completed.code, 0, completed.stderr);
  assert.match(completed.stdout, /is completed/);
  assert.match(completed.stdout, /1 external log reference not portable/);
  const shown = await cli.run("mission", "show", "--mission", id);
  assert.match(shown.stdout, /Outcome: Three LODs exported/);
  assert.match(shown.stdout, /Proposal \w+: Accepted/);
  assert.match(shown.stdout, /Log: external:C:\/agent\/run.log \(not portable\)/);
  assert.match(shown.stdout, /9\. .* Completed running -> completed by agent:codex/);
  const cancel = await cli.run(
    "mission",
    "cancel",
    "--mission",
    id,
    "--reason",
    "x",
    "--actor",
    "Ocomic",
  );
  assert.equal(cancel.code, 2);
  assert.match(cancel.stderr, /cannot go from completed/);
  const retry = await cli.json(
    "mission",
    "create",
    "--project",
    "game",
    "--title",
    "Follow-up",
    "--goal",
    "LOD3",
    "--predecessor",
    id,
    ...agent,
  );
  assert.equal(retry.predecessorMissionId, id);
  const list = await cli.run("mission", "list", "--project", "game");
  assert.ok(
    list.stdout.indexOf("[queued] Follow-up") <
      list.stdout.indexOf("[completed] Export barrel LODs"),
  );
  assert.match((await cli.run("mission", "wait", "--help")).stdout, /needs_manual_action/);
  const status = await cli.run("workspace", "status");
  assert.equal(status.code, 0);
});
