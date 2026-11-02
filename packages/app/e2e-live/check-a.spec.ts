import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startAppServer, XoraRuntime } from "@loxora/app";
import { defaultWorkspaceDirectory, settingsPath } from "@loxora/cli";
import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Check A of Milestone 16 delivery 2 with Xora's real model, as the captain went through it
 * by hand: the start screen, the step "Xora", the plan typed right away, the project name
 * Xora suggests, and Xora on the bridge. It uses a temporary LOXORA_HOME, so the captain's
 * own settings and logbook are never touched, and attaches to the model that already runs
 * (LOXORA_LIVE_XORA_URL, default http://127.0.0.1:8080).
 *
 * What the app decides is checked hard; what the model says is only recorded (soft checks),
 * because a small model answers differently every time. Screenshots and every message of
 * Xora land in output/xora-live/<time>/, with a report "bericht.md".
 */

const URL = process.env.LOXORA_LIVE_XORA_URL ?? "http://127.0.0.1:8080";
const PLAN =
  process.env.LOXORA_LIVE_PLAN ??
  "Ein mobile Webgame online RPG mit Soulslike Elementen erstellen.";
const ANSWER = "Antwort an Xora";

interface Entry {
  readonly step: string;
  readonly captain?: string;
  readonly xora: readonly string[];
  readonly seconds: number;
  readonly shot?: string;
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const report = resolve(
  process.env.LOXORA_LIVE_REPORT ?? join(process.cwd(), "output", "xora-live", stamp),
);
const entries: Entry[] = [];
const notes: string[] = [];

/** A message Xora wrote: a key that stays the same while it shows, and its text. */
type Said = readonly [key: string, text: string];

/** Xora's setup messages so far; the setup log only grows, so the position is the key. */
async function setupMessages(page: Page): Promise<Said[]> {
  const texts = await page.locator(".chat-message.chat-xora p").allInnerTexts();
  return texts.map((text, index) => [String(index), text] as const);
}

/** Runs one step, records what Xora said during it, and takes a screenshot afterwards. */
async function step(
  page: Page,
  name: string,
  work: () => Promise<void>,
  options: { captain?: string; shot?: string; read?: (page: Page) => Promise<Said[]> } = {},
) {
  const read = options.read ?? setupMessages;
  const before = new Set((await read(page)).map(([key]) => key));
  const started = Date.now();
  await work();
  const said = (await read(page)).filter(([key]) => !before.has(key)).map(([, text]) => text);
  const shot = options.shot ? `${options.shot}.png` : undefined;
  if (shot) await page.screenshot({ path: join(report, shot) });
  entries.push({
    step: name,
    ...(options.captain ? { captain: options.captain } : {}),
    xora: said,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    ...(shot ? { shot } : {}),
  });
}

/** Waits until the captain's answer shows and Xora is done with it. */
async function settled(page: Page, before: number) {
  await expect
    .poll(() => page.locator(".chat-message.chat-captain").count(), { timeout: 10_000 })
    .toBeGreaterThan(before);
  await expect(page.locator(".chat-working")).toHaveCount(0, { timeout: 180_000 });
  await expect(page.getByLabel(ANSWER)).toBeEnabled({ timeout: 180_000 });
}

async function say(page: Page, text: string) {
  const box = page.getByLabel(ANSWER);
  await expect(box).toBeEnabled();
  const before = await page.locator(".chat-message.chat-captain").count();
  await box.fill(text);
  await box.press("Enter");
  await settled(page, before);
}

async function tap(page: Page, name: string | RegExp, options: { leaves?: boolean } = {}) {
  const before = await page.locator(".chat-message.chat-captain").count();
  await page.getByRole("button", { name, exact: typeof name === "string" }).click();
  if (!options.leaves) await settled(page, before);
}

/** Xora's chat messages on the bridge, by message id. */
function xoraEntries(page: Page): Locator {
  return page.locator("li.entry-message").filter({
    has: page.locator(".entry-head strong", { hasText: /^Xora$/ }),
  });
}

async function bridgeMessages(page: Page): Promise<Said[]> {
  const found = await xoraEntries(page).evaluateAll((items) =>
    items.map((item) => {
      const body = item.querySelector(".entry-body")?.cloneNode(true) as HTMLElement | undefined;
      for (const extra of body?.querySelectorAll(".entry-head, .entry-links") ?? []) extra.remove();
      return [item.id, (body?.textContent ?? "").trim()] as const;
    }),
  );
  // The same message can show in the chat and in its thread pane.
  return [...new Map(found).entries()];
}

async function ask(page: Page, text: string) {
  const known = await xoraEntries(page).evaluateAll((items) => items.map((item) => item.id));
  const box = page.getByRole("textbox", { name: "Nachricht" }).first();
  await box.fill(text);
  await box.press("Enter");
  await expect
    .poll(
      async () =>
        (await xoraEntries(page).evaluateAll((items) => items.map((item) => item.id))).some(
          (id) => !known.includes(id),
        ),
      { timeout: 180_000 },
    )
    .toBe(true);
}

function writeReport(model: string, failed: string | null) {
  const lines = [
    "# Check A mit echtem Modell",
    "",
    `- Zeit: ${new Date().toLocaleString("de-DE")}`,
    `- Modell: ${model} (${URL})`,
    `- Plan getippt: „${PLAN}“`,
    `- Ergebnis: ${failed ? `abgebrochen: ${failed}` : "durchgelaufen"}`,
    "",
    ...(notes.length ? ["## Hinweise", "", ...notes.map((note) => `- ${note}`), ""] : []),
    "## Schritte",
    "",
  ];
  for (const entry of entries) {
    lines.push(`### ${entry.step} (${entry.seconds} s)`, "");
    if (entry.captain) lines.push(`**Kapitän:** ${entry.captain}`, "");
    for (const text of entry.xora) lines.push(`**Xora:** ${text.replace(/\n+/g, " ")}`, "");
    if (!entry.xora.length) lines.push("_Xora hat in diesem Schritt nichts geschrieben._", "");
    if (entry.shot) lines.push(`![${entry.step}](${entry.shot})`, "");
  }
  writeFileSync(join(report, "bericht.md"), `${lines.join("\n")}\n`);
  writeFileSync(
    join(report, "bericht.json"),
    `${JSON.stringify({ model, url: URL, failed, notes, entries }, null, 2)}\n`,
  );
}

test("Check A: setup and bridge with Xora's real model", async ({ page }) => {
  mkdirSync(report, { recursive: true });
  const home = mkdtempSync(join(tmpdir(), "loxora-live-"));
  mkdirSync(join(home, "Documents"));
  const env = { LOXORA_HOME: home };
  const xora = new XoraRuntime({ settingsPath: settingsPath(env), attachUrl: URL });
  const status = await xora.start();
  const model = status.modelLabel ?? "unbekannt";
  if (status.state !== "ready") {
    writeReport(model, `Xora ist nicht online (${status.reason ?? status.state})`);
    throw new Error(
      `Xora's model does not answer at ${URL} (${status.reason ?? status.state}). Start llama-server first.`,
    );
  }
  const server = await startAppServer({
    port: 0,
    settings: {
      path: settingsPath(env),
      defaultWorkspace: defaultWorkspaceDirectory(env),
      documents: () => join(home, "Documents"),
      env: {},
    },
    xora,
  });
  let failed: string | null = null;
  try {
    await step(
      page,
      "Start",
      async () => {
        await page.goto(server.url);
        await expect(page.getByText(`online (${model})`)).toBeVisible();
        await expect(page.getByLabel(ANSWER)).toBeEnabled();
      },
      { shot: "01-start" },
    );

    await step(page, "Name", () => say(page, "Oliver"), {
      captain: "Oliver",
      shot: "02-schritt-xora",
    });
    await expect(page.getByRole("button", { name: "Was heißt das?" })).toBeVisible();
    await step(page, "Was heißt das?", () => tap(page, "Was heißt das?"), {
      captain: "(tippt) Was heißt das?",
      shot: "03-erklaerung",
    });
    await expect(page.getByRole("button", { name: "Modell", exact: true })).toBeVisible();
    await step(page, "Modell behalten", () => tap(page, "Erst mal so lassen"), {
      captain: "(tippt) Erst mal so lassen",
    });

    await step(page, "Schiff", () => say(page, "Sternenfalke"), { captain: "Sternenfalke" });
    // Free text at a choice: the model places it on a button or asks back.
    await step(page, "Logbuch (frei getippt)", () => say(page, "Klingt vernünftig"), {
      captain: "Klingt vernünftig",
      shot: "04-logbuch",
    });
    if (await page.getByRole("button", { name: "Passt so", exact: true }).isVisible()) {
      notes.push("„Klingt vernünftig“ hat Xora beim Logbuch nicht als „Passt so“ verstanden.");
      await tap(page, "Passt so");
    }
    await expect(page.getByRole("button", { name: "Neues Projekt starten" })).toBeVisible();

    // Check A finding 1: the plan typed right away is not asked for again.
    await step(page, "Projekt mit Beschreibung", () => say(page, PLAN), {
      captain: PLAN,
      shot: "05-namensvorschlag",
    });
    const suggestion = page.getByRole("button", { name: /^„.+“ nehmen$/ });
    await expect(suggestion).toBeVisible();
    const name = ((await suggestion.innerText()).match(/„(.+)“/) ?? [])[1] ?? "?";
    notes.push(`Namensvorschlag von Xora: „${name}“.`);
    await expect.soft(page.getByRole("button", { name: "Ein Spiel" })).toHaveCount(0);
    await step(page, "Vorschlag nehmen", () => tap(page, /^„.+“ nehmen$/), {
      captain: `(tippt) „${name}“ nehmen`,
      shot: "06-karte",
    });
    await expect(page.getByText(`Ich lege an: Projekt „${name}“.`)).toBeVisible();
    await step(page, "Anlegen", () => tap(page, "Anlegen"), { captain: "(tippt) Anlegen" });
    await tap(page, "Zur Brücke", { leaves: true });
    await expect(page).toHaveURL(/\/bridge\/direct%3Axora$/);
    await expect(page.getByRole("region", { name: "Erste Mission" })).toBeVisible();
    const purpose = (
      JSON.parse(readFileSync(settingsPath(env), "utf8")) as { setup?: { purpose?: string } }
    ).setup?.purpose;
    expect(purpose).toBe(PLAN);

    // Check A finding 2: "What now?" points to the first Mission.
    const bridge = { read: bridgeMessages };
    await step(
      page,
      "Brücke: Was soll ich jetzt tun?",
      () => ask(page, "Was soll ich jetzt tun?"),
      {
        ...bridge,
        captain: "Was soll ich jetzt tun?",
        shot: "07-bruecke-was-jetzt",
      },
    );
    await expect(
      page.getByText("Am besten startest du jetzt deine erste Mission").first(),
    ).toBeVisible();
    for (const [index, question] of [
      "Was ist ein Logbuch?",
      "Was kannst du schon für mich tun?",
      "Kannst du ein besseres Modell nehmen?",
    ].entries()) {
      await step(page, `Brücke: ${question}`, () => ask(page, question), {
        ...bridge,
        captain: question,
        shot: `${String(8 + index).padStart(2, "0")}-bruecke`,
      });
    }
  } catch (error) {
    failed = error instanceof Error ? (error.message.split("\n")[0] ?? "Fehler") : String(error);
    await page.screenshot({ path: join(report, "99-fehler.png") }).catch(() => undefined);
    throw error;
  } finally {
    writeReport(model, failed);
    await server.close();
    xora.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
