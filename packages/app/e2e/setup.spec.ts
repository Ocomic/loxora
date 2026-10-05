import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startAppServer } from "@loxora/app";
import { defaultWorkspaceDirectory, runCli, settingsPath } from "@loxora/cli";
import { expect, type Page, test } from "@playwright/test";

/**
 * Milestone 13 in script mode, clicked through as a person would: the full setup in German
 * and in English, opening an existing workspace, and skipping the first steps. Every test
 * has its own temporary LOXORA_HOME and Documents folder.
 */
interface Ship {
  readonly url: string;
  readonly home: string;
  readonly env: Record<string, string>;
}

let ship: Ship;
let close: () => Promise<void>;

test.beforeEach(async () => {
  const home = mkdtempSync(join(tmpdir(), "loxora-e2e-"));
  mkdirSync(join(home, "Documents"));
  const env = { LOXORA_HOME: home };
  const server = await startAppServer({
    port: 0,
    settings: {
      path: settingsPath(env),
      defaultWorkspace: defaultWorkspaceDirectory(env),
      documents: () => join(home, "Documents"),
      env: {},
    },
  });
  ship = { url: server.url, home, env };
  close = async () => {
    await server.close();
    rmSync(home, { recursive: true, force: true });
  };
});

test.afterEach(async () => {
  await close();
});

function settings(): Record<string, unknown> {
  return JSON.parse(readFileSync(settingsPath(ship.env), "utf8")) as Record<string, unknown>;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

const TEXT = {
  de: {
    name: "Dein Name",
    next: "Weiter",
    fits: "Passt so",
    goal: "Ein Spiel entwickeln",
    project: "Mein Spiel",
    create: "Anlegen",
    start: "Starten",
    openMission: "Mission öffnen",
    option: "Für mich selbst",
    continue: "Weiter einrichten",
    accept: "Übernehmen",
    finish: "Zur Brücke",
    skip: "Erste Schritte überspringen",
    openShip: "Dieses Schiff öffnen",
    projectCard: "Ich lege an: Projekt „Mein Spiel“.",
    question: "Für wen ist das Projekt?",
    template: "Ein eigenes Spiel entwickeln.\nFür wen: Für mich selbst.",
    bar: "Nachricht an Xora",
    send: "Senden",
    notOnBoard: "Ich bin in dieser Version noch nicht an Bord",
    askMissions: "Wie bekomme ich Missionen?",
    missionsReply: "loxora mission create",
    completed: "Abgeschlossen",
  },
  en: {
    name: "Your name",
    next: "Continue",
    fits: "Looks good",
    goal: "Develop a game",
    project: "My game",
    create: "Create",
    start: "Start",
    openMission: "Open the mission",
    option: "For myself",
    continue: "Continue setup",
    accept: "Accept",
    finish: "To the bridge",
    skip: "Skip the first steps",
    openShip: "Open this ship",
    projectCard: "I create: project “My game”.",
    question: "Who is the project for?",
    template: "Develop a game of my own.\nFor whom: For myself.",
    bar: "Message to Xora",
    send: "Send",
    notOnBoard: "In this version I'm not on board yet",
    askMissions: "How do I get missions?",
    missionsReply: "loxora mission create",
    completed: "Completed",
  },
} as const;

/** Scenes B1 to C3: name, ship, logbook, orientation, script mode. */
async function throughSetup(page: Page, text: (typeof TEXT)["de" | "en"]) {
  await page.goto(ship.url);
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel(text.name).fill("Alex");
  await page.getByRole("button", { name: text.next, exact: true }).click();
  await page.getByRole("button", { name: "Nova", exact: true }).click();
  await page.getByRole("button", { name: text.fits }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: text.next, exact: true }).click();
  }
  await expect(page).toHaveURL(/\/first-steps$/);
}

for (const language of ["de", "en"] as const) {
  test.describe(`full setup (${language})`, () => {
    test.use({ locale: language === "de" ? "de-DE" : "en-US" });

    test("from the first question to accepted knowledge, by clicking", async ({ page }) => {
      const text = TEXT[language];
      const errors = watchErrors(page);
      await throughSetup(page, text);

      // D1 and D2: goal, project name, confirmation card.
      await page.getByRole("button", { name: text.goal }).click();
      await page.getByRole("button", { name: text.project, exact: true }).click();
      await expect(page.getByText(text.projectCard)).toBeVisible();
      await page.getByRole("button", { name: text.create, exact: true }).click();

      // E1: the first Mission's card, then E2 in Mission Detail.
      await expect(page.getByText(text.question)).toBeVisible();
      await page.getByRole("button", { name: text.start, exact: true }).click();
      await page.getByRole("link", { name: text.openMission }).click();
      await expect(page).toHaveURL(/\/missions\/[^/]+$/);
      await page.getByRole("button", { name: text.option }).click();

      // The banner leads back to E3: template, confirmation card, accept.
      await page.getByRole("link", { name: text.continue }).click();
      await expect(page.locator("textarea")).toHaveValue(text.template);
      await page.getByRole("button", { name: text.next, exact: true }).click();
      await page.getByRole("button", { name: text.accept, exact: true }).click();

      // E4: two hints and the closing sentence.
      await page.getByRole("button", { name: text.next, exact: true }).click();
      await page.getByRole("button", { name: text.next, exact: true }).click();
      await page.getByRole("button", { name: text.finish }).click();
      await expect(page).toHaveURL(/\/missions$/);
      await expect(page.getByRole("link", { name: text.continue })).toHaveCount(0);
      await expect(page.getByText(text.completed).first()).toBeVisible();

      // The input bar answers with the fixed script-mode text.
      await page.getByLabel(text.bar, { exact: true }).fill("Hello Xora");
      await page.getByRole("button", { name: text.send }).click();
      await expect(page.getByText(text.notOnBoard)).toBeVisible();

      const setup = settings().setup as Record<string, unknown>;
      expect(typeof setup.completedAt).toBe("string");
      expect(typeof setup.proposalId).toBe("string");
      expect(errors).toEqual([]);
    });
  });
}

test.describe("existing and skipped", () => {
  test.use({ locale: "de-DE" });

  test("an existing workspace opens in place; the first steps can be skipped", async ({ page }) => {
    const text = TEXT.de;
    const workspace = defaultWorkspaceDirectory(ship.env);
    const code = await runCli(["workspace", "init", "--reviewer", "alex", "--name", "Kepler"], {
      env: ship.env,
      cwd: ship.home,
      stdout: () => undefined,
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    const errors = watchErrors(page);
    await page.goto(ship.url);
    await page.getByRole("button", { name: text.openShip }).click();
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: text.next, exact: true }).click();
    }
    await expect(page).toHaveURL(/\/first-steps$/);
    await page.getByRole("button", { name: text.skip }).click();
    await expect(page).toHaveURL(/\/missions$/);
    await expect(page.getByRole("link", { name: text.continue })).toHaveCount(0);
    expect(settings().workspacePath).toBe(workspace);

    // The empty state opens the input bar with the answer for its topic.
    await page.getByRole("button", { name: text.askMissions }).click();
    await expect(page.getByText(text.missionsReply).last()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("skipping keeps Mission Control usable and writes nothing", async ({ page }) => {
    const text = TEXT.de;
    await throughSetup(page, text);
    await page.getByRole("button", { name: text.skip }).click();
    await expect(page).toHaveURL(/\/missions$/);
    const setup = settings().setup as Record<string, unknown>;
    expect(typeof setup.completedAt).toBe("string");
    expect(setup.projectId).toBeUndefined();
  });

  test("an interrupted first step continues through the banner", async ({ page }) => {
    const text = TEXT.de;
    await throughSetup(page, text);
    await page.getByRole("button", { name: text.goal }).click();
    await page.getByRole("button", { name: text.project, exact: true }).click();
    await page.getByRole("button", { name: text.create, exact: true }).click();
    await expect(page.getByText(text.question)).toBeVisible();
    await page.goto(`${ship.url}/missions`);
    await page.getByRole("link", { name: text.continue }).click();
    await expect(page.getByRole("button", { name: text.start, exact: true })).toBeVisible();
  });
});
