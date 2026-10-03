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
} from "@loxora/core";
import { openSqliteReadOnlyStore } from "@loxora/sqlite";
import {
  Labels,
  MISSION_FILTERS,
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
}

export interface AppServer {
  readonly url: string;
  close(): Promise<void>;
}

class WorkspaceUnavailable extends Error {}

type Store = Awaited<ReturnType<typeof openSqliteReadOnlyStore>>;

/**
 * Local, read-only product UI server (RFC-010). Binds to 127.0.0.1, serves the web client
 * and a read API over Core reads. Every request opens the workspace read-only, so CLI
 * writes and migrations are picked up without restarting.
 */
export async function startAppServer(options: AppServerOptions): Promise<AppServer> {
  const webRoot = options.webRoot ?? resolve(import.meta.dirname, "..", "..", "web");
  const server = createServer(async (request, response) => {
    const requestId = crypto.randomUUID();
    try {
      if (request.url?.startsWith("/api/"))
        await api(options.workspaceDirectory, request, response);
      else staticFile(webRoot, request, response);
    } catch (error) {
      if (error instanceof WorkspaceUnavailable) {
        return json(response, 503, {
          error: "WorkspaceUnavailable",
          message: error.message,
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
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((done, reject) => {
        server.close((error) => (error ? reject(error) : done()));
        server.closeAllConnections();
      }),
  };
}

async function withStore<T>(
  workspaceDirectory: string,
  work: (store: Store) => Promise<T>,
): Promise<T> {
  const path = databasePath(workspaceDirectory);
  if (!existsSync(path)) {
    throw new WorkspaceUnavailable(
      'No workspace found. Create one with "loxora workspace init --reviewer <your-id>".',
    );
  }
  let store: Store;
  try {
    store = await openSqliteReadOnlyStore(path, REQUIRED_MIGRATION);
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

async function api(
  workspaceDirectory: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "GET") {
    return json(response, 405, {
      error: "ReadOnly",
      message: "The Mission Control MVP is read-only; write with the loxora CLI.",
    });
  }
  if (url.pathname === "/api/workspace") {
    const config = loadWorkspaceConfig(workspaceDirectory);
    return json(response, 200, {
      name: config.name,
      reviewers: config.reviewers,
      actor: null,
      readOnly: true,
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
        return missionDetail(mission, events, new Labels(await store.readWorkspaceExport()));
      }),
    );
  }
  json(response, 404, { error: "NotFound" });
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
