import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, resolve } from "node:path";
import { databasePath, loadWorkspaceConfig } from "@loxora/cli";
import {
  compareMissionsByAttention,
  LoxoraError,
  type MissionId,
  MissionService,
  NotFoundError,
  StaleMissionError,
} from "@loxora/core";
import { openSqliteReadOnlyStore, openSqliteWritableStore } from "@loxora/sqlite";
import {
  availableActions,
  Labels,
  MISSION_ACTIONS,
  MISSION_FILTERS,
  type MissionAction,
  type MissionFilter,
  matchesFilter,
  missionDetail,
  missionSummary,
} from "./views.js";

/** The migration the product UI needs; it never applies migrations itself (RFC-010). */
export const REQUIRED_MIGRATION = "007_missions";

export interface AppServerOptions {
  readonly workspaceDirectory: string;
  /** 0 picks a free port. */
  readonly port?: number;
  readonly webRoot?: string;
  /**
   * The human workspace actor for UI writes (RFC-010, section 9). Without it the app is
   * read-only. It must not be an `agent:*` id and must be a workspace reviewer.
   */
  readonly actor?: string;
}

/** Thrown at start when the configured actor may not write through the UI. */
export class ActorRejected extends Error {}

export interface AppServer {
  readonly url: string;
  close(): Promise<void>;
}

class WorkspaceUnavailable extends Error {}

/** A rejected write request; `status` is the HTTP status to answer. */
class RequestRejected extends Error {
  public constructor(
    public readonly status: number,
    public readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

type Store = Awaited<ReturnType<typeof openSqliteReadOnlyStore>>;
type WritableStore = Awaited<ReturnType<typeof openSqliteWritableStore>>;

const MAX_BODY_BYTES = 16 * 1024;

/**
 * Local product UI server (RFC-010). Binds to 127.0.0.1, serves the web client and a read
 * API over Core reads. Every request opens the workspace anew, so CLI writes and migrations
 * are picked up without restarting. With a configured human actor it also offers the write
 * routes of Milestone 12; without one it is read-only.
 */
export async function startAppServer(options: AppServerOptions): Promise<AppServer> {
  const webRoot = options.webRoot ?? resolve(import.meta.dirname, "..", "..", "web");
  const actor = options.actor === undefined ? null : checkActor(options);
  let origins: readonly string[] = [];
  const server = createServer(async (request, response) => {
    const requestId = crypto.randomUUID();
    try {
      if (request.url?.startsWith("/api/")) {
        await api(
          { workspaceDirectory: options.workspaceDirectory, actor, origins },
          request,
          response,
        );
      } else staticFile(webRoot, request, response);
    } catch (error) {
      if (error instanceof RequestRejected) {
        return json(response, error.status, {
          error: error.kind,
          message: error.message,
          requestId,
        });
      }
      if (error instanceof WorkspaceUnavailable) {
        return json(response, 503, {
          error: "WorkspaceUnavailable",
          message: error.message,
          requestId,
        });
      }
      if (error instanceof StaleMissionError) {
        return json(response, 409, {
          error: "Stale",
          message: "The mission has changed since it was loaded; reload it and try again.",
          requestId,
        });
      }
      if (error instanceof NotFoundError) {
        return json(response, 404, { error: "NotFound", message: error.message, requestId });
      }
      if (error instanceof LoxoraError) {
        return json(response, 400, { error: "Invalid", message: error.message, requestId });
      }
      json(response, 500, { error: "InternalError", requestId });
    }
  });
  await new Promise<void>((ready) => server.listen(options.port ?? 4180, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((done, reject) => {
        server.close((error) => (error ? reject(error) : done()));
        server.closeAllConnections();
      }),
  };
}

function checkActor(options: AppServerOptions): string {
  const actor = (options.actor ?? "").trim();
  if (!actor) throw new ActorRejected("--actor needs a value");
  if (actor.startsWith("agent:")) {
    throw new ActorRejected(
      `${actor} is an agent; UI writes need a human workspace actor (RFC-010, section 9)`,
    );
  }
  let reviewers: readonly string[];
  try {
    reviewers = loadWorkspaceConfig(options.workspaceDirectory).reviewers;
  } catch {
    throw new ActorRejected("No workspace found; write mode needs an existing workspace");
  }
  if (!reviewers.includes(actor)) {
    throw new ActorRejected(
      `${actor} is not a human of this workspace; known reviewers: ${reviewers.join(", ")}`,
    );
  }
  return actor;
}

async function withStore<T>(
  workspaceDirectory: string,
  work: (store: Store) => Promise<T>,
): Promise<T> {
  return openStore(workspaceDirectory, openSqliteReadOnlyStore, work);
}

async function openStore<S extends { close(): Promise<void> }, T>(
  workspaceDirectory: string,
  open: (path: string, requiredMigrationId: string) => Promise<S>,
  work: (store: S) => Promise<T>,
): Promise<T> {
  const path = databasePath(workspaceDirectory);
  if (!existsSync(path)) {
    throw new WorkspaceUnavailable(
      'No workspace found. Create one with "loxora workspace init --reviewer <your-id>".',
    );
  }
  let store: S;
  try {
    store = await open(path, REQUIRED_MIGRATION);
  } catch {
    throw new WorkspaceUnavailable(
      `The workspace needs migration ${REQUIRED_MIGRATION}. The UI never migrates; run any loxora CLI command once (after a backup copy of the workspace directory).`,
    );
  }
  try {
    return await work(store);
  } finally {
    await store.close();
  }
}

interface ApiContext {
  readonly workspaceDirectory: string;
  readonly actor: string | null;
  readonly origins: readonly string[];
}

async function api(
  context: ApiContext,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { workspaceDirectory, actor } = context;
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "GET") {
    const write = url.pathname.match(/^\/api\/missions\/([^/]+)\/([a-z]+)$/);
    const action = MISSION_ACTIONS.find((name) => name === write?.[2]);
    if (request.method !== "POST" || !write || !action) {
      return json(response, 405, {
        error: "MethodNotAllowed",
        message: "Only the Mission write routes accept POST.",
      });
    }
    const body = await readWriteRequest(request, context);
    if (!actor) {
      throw new RequestRejected(
        403,
        "ReadOnly",
        "The app runs read-only; start it with --actor <your-id> to act in the UI.",
      );
    }
    const missionId = decodeURIComponent(write[1] ?? "") as MissionId;
    return json(
      response,
      200,
      await openStore(workspaceDirectory, openSqliteWritableStore, (store) =>
        act(store, missionId, action, actor, body),
      ),
    );
  }
  if (url.pathname === "/api/workspace") {
    const config = loadWorkspaceConfig(workspaceDirectory);
    return json(response, 200, {
      name: config.name,
      reviewers: config.reviewers,
      actor,
      readOnly: actor === null,
    });
  }
  if (url.pathname === "/api/projects") {
    return json(
      response,
      200,
      await withStore(workspaceDirectory, async (store) =>
        new Labels(await store.readWorkspaceExport()).projectList(),
      ),
    );
  }
  if (url.pathname === "/api/missions") {
    const filter = (url.searchParams.get("filter") ?? "all") as MissionFilter;
    if (!MISSION_FILTERS.includes(filter)) throw new LoxoraError(`Unknown filter: ${filter}`);
    const project = url.searchParams.get("project");
    return json(
      response,
      200,
      await withStore(workspaceDirectory, async (store) => {
        const labels = new Labels(await store.readWorkspaceExport());
        const all = (
          await new MissionService(store).listMissions(
            project ? { projectId: project as never } : {},
          )
        )
          .slice()
          .sort(compareMissionsByAttention);
        return {
          counts: Object.fromEntries(
            MISSION_FILTERS.map((name) => [name, all.filter((m) => matchesFilter(m, name)).length]),
          ),
          missions: all
            .filter((m) => matchesFilter(m, filter))
            .map((m) => missionSummary(m, labels)),
        };
      }),
    );
  }
  const detail = url.pathname.match(/^\/api\/missions\/([^/]+)(\/events)?$/);
  if (detail) {
    const missionId = decodeURIComponent(detail[1] ?? "") as MissionId;
    return json(
      response,
      200,
      await withStore(workspaceDirectory, async (store) => {
        const missions = new MissionService(store);
        const mission = await missions.getMission({ missionId });
        if (!mission) throw new NotFoundError(`Mission ${missionId} was not found`);
        const events = await missions.getMissionEvents({ missionId });
        if (detail[2]) return events;
        return missionDetail(mission, events, new Labels(await store.readWorkspaceExport()), actor);
      }),
    );
  }
  json(response, 404, { error: "NotFound" });
}

/**
 * Local request protection for writes (Milestone 12): same origin, a local host name, a
 * JSON body, and a size limit. Checked before the workspace is touched. This guards against
 * other pages in the browser and DNS rebinding; it is not authentication.
 */
async function readWriteRequest(
  request: IncomingMessage,
  context: ApiContext,
): Promise<Record<string, unknown>> {
  const host = request.headers.host ?? "";
  if (!context.origins.some((origin) => origin === `http://${host}`)) {
    throw new RequestRejected(403, "Forbidden", "Unexpected host");
  }
  if (!context.origins.includes(request.headers.origin ?? "")) {
    throw new RequestRejected(403, "Forbidden", "Writes are only accepted from the app itself");
  }
  const type = request.headers["content-type"] ?? "";
  if (!/^application\/json(\s*;|$)/i.test(type)) {
    throw new RequestRejected(415, "UnsupportedMediaType", "Send the request as JSON");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      throw new RequestRejected(413, "TooLarge", "The request is too large");
    }
    chunks.push(chunk as Buffer);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestRejected(400, "Invalid", "The request is not valid JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestRejected(400, "Invalid", "The request must be a JSON object");
  }
  return value as Record<string, unknown>;
}

async function act(
  store: WritableStore,
  missionId: MissionId,
  action: MissionAction,
  actorId: string,
  body: Record<string, unknown>,
) {
  const missions = new MissionService(store);
  const mission = await missions.getMission({ missionId });
  if (!mission) throw new NotFoundError(`Mission ${missionId} was not found`);
  if (typeof body.sequence !== "number") {
    throw new RequestRejected(400, "Invalid", "sequence must be the mission sequence shown");
  }
  const expectedSequence = body.sequence;
  if (expectedSequence !== mission.sequence) {
    throw new StaleMissionError(`Mission ${missionId} changed since sequence ${expectedSequence}`);
  }
  if (!availableActions(mission, actorId).includes(action)) {
    throw new RequestRejected(403, "NotAllowed", `${action} is not available for this mission`);
  }
  const optional = (key: string) => (typeof body[key] === "string" ? body[key] : undefined);
  switch (action) {
    case "answer": {
      const decision = optional("decision");
      if (decision !== undefined && decision !== "approve" && decision !== "reject") {
        throw new LoxoraError("decision must be approve or reject");
      }
      await missions.answerAttentionRequest({
        missionId,
        actorId,
        response: optional("response") ?? "",
        expectedSequence,
        ...(decision ? { decision } : {}),
      });
      break;
    }
    case "pause": {
      const reason = optional("reason");
      await missions.pauseMission({
        missionId,
        actorId,
        expectedSequence,
        ...(reason ? { reason } : {}),
      });
      break;
    }
    case "cancel":
      await missions.cancelMission({
        missionId,
        actorId,
        reason: optional("reason") ?? "",
        expectedSequence,
      });
      break;
    case "resume":
      await missions.resumeMission({ missionId, actorId, expectedSequence });
      break;
  }
  const updated = await missions.getMission({ missionId });
  if (!updated) throw new NotFoundError(`Mission ${missionId} was not found`);
  return missionDetail(
    updated,
    await missions.getMissionEvents({ missionId }),
    new Labels(await store.readWorkspaceExport()),
    actorId,
  );
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function staticFile(root: string, request: IncomingMessage, response: ServerResponse): void {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  let path = resolve(root, `.${decodeURIComponent(pathname)}`);
  if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) {
    path = resolve(root, "index.html");
  }
  if (!existsSync(path)) {
    response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    response.end("The web client is not built. Run npm run build.");
    return;
  }
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  response.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
  response.end(readFileSync(path));
}
