import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import * as z from "zod/v4";
import type { EvidenceReferenceId, NodeId, ProjectId } from "@loxora/core";
import { DemoCoordinator } from "../orchestration/coordinator.js";

const review = z
  .object({
    decision: z.enum(["Accepted", "Rejected"]),
    reviewerId: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();
const reset = z.object({ stage: z.literal("Prepared").optional() }).strict();
const context = z
  .object({
    projectId: z.string(),
    focusNodeIds: z.array(z.string()).min(1),
    temporalViews: z.array(z.enum(["Current", "History"])),
    includeRelatedProjects: z.boolean(),
    relationshipTypes: z.array(z.literal("DependsOn")),
    maxDependencyDepth: z.union([z.literal(0), z.literal(1)]),
    taskLabel: z.string().min(1),
    estimatedTokenBudget: z.number().int().positive(),
    explicitEvidenceReferenceIds: z.array(z.string()).optional(),
  })
  .strict();

export async function startDemoServer(port = 4173): Promise<{ close(): Promise<void> }> {
  const coordinator = new DemoCoordinator();
  await coordinator.open();
  const webRoot = resolve(process.cwd(), "packages", "demo", "dist", "web");
  const server = createServer(async (request, response) => {
    const requestId = crypto.randomUUID();
    try {
      if (request.url?.startsWith("/api/")) await api(coordinator, request, response);
      else staticFile(webRoot, request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected failure";
      const status = /not found|missing/i.test(message)
        ? 404
        : /stale|duplicate|reviewable/i.test(message)
          ? 409
          : /reset|database|migration/i.test(message)
            ? 503
            : error instanceof z.ZodError
              ? 400
              : 500;
      json(response, status, { error: status === 500 ? "InternalError" : message, requestId });
    }
  });
  await new Promise<void>((resolveReady) => server.listen(port, "127.0.0.1", resolveReady));
  process.stdout.write(`Loxora demo: http://127.0.0.1:${port}\n`);
  return {
    close: async () => {
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
      await coordinator.close();
    },
  };
}

async function api(
  coordinator: DemoCoordinator,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/api/demo/status")
    return json(response, 200, await coordinator.status());
  if (request.method === "POST") enforceMutation(request);
  if (request.method === "POST" && url.pathname === "/api/demo/reset") {
    reset.parse(await body(request));
    return json(response, 200, await coordinator.reset("Prepared"));
  }
  if (request.method === "POST" && url.pathname === "/api/demo/resume")
    return json(response, 200, await coordinator.resume());
  if (request.method === "GET" && url.pathname === "/api/review-inbox") {
    const s = coordinator.services();
    return json(
      response,
      200,
      await s.inbox.getReviewInbox({
        projectIds: Object.values(coordinator.manifest.projects).map((p) => p.id as ProjectId),
      }),
    );
  }
  let match = url.pathname.match(/^\/api\/reviews\/knowledge\/([^/]+)$/);
  if (request.method === "POST" && match) {
    const proposalId = match[1];
    if (!proposalId) throw new Error("Proposal ID is missing");
    const input = review.parse(await body(request));
    return json(
      response,
      200,
      await coordinator.reviewKnowledge(proposalId, input.decision, input.reviewerId, input.reason),
    );
  }
  match = url.pathname.match(/^\/api\/reviews\/relationship\/([^/]+)$/);
  if (request.method === "POST" && match) {
    const proposalId = match[1];
    if (!proposalId) throw new Error("Proposal ID is missing");
    const input = review.parse(await body(request));
    return json(
      response,
      200,
      await coordinator.reviewRelationship(
        proposalId,
        input.decision,
        input.reviewerId,
        input.reason,
      ),
    );
  }
  if (request.method === "POST" && url.pathname === "/api/demo/assess-impact")
    return json(response, 200, await coordinator.assessImpact());
  if (request.method === "POST" && url.pathname === "/api/demo/rollback")
    return json(response, 200, await coordinator.recordRollback());
  if (request.method === "POST" && url.pathname === "/api/context-packages") {
    const input = context.parse(await body(request));
    return json(
      response,
      200,
      await coordinator.buildContextPackage({
        ...input,
        readableProjectIds: Object.values(coordinator.manifest.projects).map((p) => p.id),
      }),
    );
  }
  if (request.method === "GET" && url.pathname === "/api/demo/mcp-proof")
    return json(
      response,
      200,
      existsSync(coordinator.proofPath)
        ? JSON.parse(readFileSync(coordinator.proofPath, "utf8"))
        : { passed: false, message: "Run npm run demo:mcp:proof" },
    );
  const projectMap = url.pathname.match(/^\/api\/projects\/([^/]+)\/map$/);
  if (request.method === "GET" && projectMap)
    return json(
      response,
      200,
      await coordinator
        .services()
        .navigation.getProjectMap({ projectId: projectMap[1] as ProjectId }),
    );
  const space = url.pathname.match(/^\/api\/projects\/([^/]+)\/spaces\/([^/]+)$/);
  if (request.method === "GET" && space)
    return json(
      response,
      200,
      await coordinator.services().navigation.getSpaceNavigation({
        projectId: space[1] as ProjectId,
        spaceId: space[2] as never,
      }),
    );
  const collection = url.pathname.match(/^\/api\/projects\/([^/]+)\/collections\/([^/]+)$/);
  if (request.method === "GET" && collection)
    return json(
      response,
      200,
      await coordinator.services().navigation.getCollectionNavigation({
        projectId: collection[1] as ProjectId,
        collectionId: collection[2] as never,
      }),
    );
  const node = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/(current|history|planned)$/,
  );
  if (request.method === "GET" && node) {
    const s = coordinator.services();
    const input = { projectId: node[1] as ProjectId, nodeId: node[2] as NodeId };
    return json(
      response,
      200,
      node[3] === "current"
        ? await s.lifecycle.getCurrentKnowledge(input)
        : node[3] === "history"
          ? await s.lifecycle.getKnowledgeHistory(input)
          : await s.plans.getProjectPlans(input),
    );
  }
  const evidence = url.pathname.match(/^\/api\/projects\/([^/]+)\/evidence\/([^/]+)$/);
  if (request.method === "GET" && evidence)
    return json(
      response,
      200,
      await coordinator.services().navigation.getEvidenceNavigation({
        projectId: evidence[1] as ProjectId,
        evidenceReferenceId: evidence[2] as EvidenceReferenceId,
      }),
    );
  const source = url.pathname.match(/^\/api\/projects\/([^/]+)\/sources\/([^/]+)$/);
  if (request.method === "GET" && source)
    return json(
      response,
      200,
      await coordinator.services().navigation.getSourceNavigation({
        projectId: source[1] as ProjectId,
        sourceReferenceId: source[2] as never,
      }),
    );
  const impact = url.pathname.match(/^\/api\/impact\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (request.method === "GET" && impact)
    return json(
      response,
      200,
      await coordinator.services().impact.getRevisionImpact({
        providerProjectId: impact[1] as ProjectId,
        providerNodeId: impact[2] as NodeId,
        providerRevisionId: impact[3] as never,
        access: {
          readableProjectIds: Object.values(coordinator.manifest.projects).map(
            (p) => p.id as ProjectId,
          ),
        },
      }),
    );
  json(response, 404, { error: "NotFound" });
}

function enforceMutation(request: IncomingMessage): void {
  if (request.headers.origin && request.headers.origin !== "http://127.0.0.1:4173")
    throw new z.ZodError([]);
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new z.ZodError([]);
}
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}
function staticFile(root: string, request: IncomingMessage, response: ServerResponse): void {
  let path = resolve(root, (request.url ?? "/").slice(1));
  if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory())
    path = resolve(root, "index.html");
  const type: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  response.writeHead(200, { "content-type": type[extname(path)] ?? "application/octet-stream" });
  response.end(readFileSync(path));
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) void startDemoServer();
