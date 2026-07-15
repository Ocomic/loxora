import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as z from "zod/v4";

const project = z.object({
  id: z.string().uuid(),
  name: z.string(),
  purpose: z.string(),
  spaceId: z.string().uuid(),
  space: z.string(),
  spaceDescription: z.string(),
  collectionId: z.string().uuid(),
  collection: z.string(),
  collectionDescription: z.string(),
  nodeId: z.string().uuid(),
  node: z.string(),
});
const source = z.object({
  alias: z.string(),
  id: z.string().uuid(),
  evidenceId: z.string().uuid(),
  project: z.enum(["identity", "portal"]),
  path: z.string(),
  title: z.string(),
  summary: z.string(),
});
const schema = z.object({
  fixtureVersion: z.literal("hackathon-demo-v1"),
  reviewer: z.string(),
  scope: z.string(),
  projects: z.object({ identity: project, portal: project }),
  sources: z.array(source),
  artifacts: z.record(z.string(), z.string().uuid()),
});
export type DemoManifest = z.infer<typeof schema>;

export function fixtureRoot(): string {
  return resolve(process.cwd(), "fixtures", "hackathon-demo-v1");
}
export function loadManifest(): DemoManifest {
  return schema.parse(JSON.parse(readFileSync(resolve(fixtureRoot(), "manifest.json"), "utf8")));
}
export function fixtureText(path: string): string {
  return readFileSync(resolve(fixtureRoot(), path), "utf8").trim();
}
