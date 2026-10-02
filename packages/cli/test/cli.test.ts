import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCli } from "../src/cli.js";

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
  assert.match(plans.stdout, /not implemented, not canonical/);
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
