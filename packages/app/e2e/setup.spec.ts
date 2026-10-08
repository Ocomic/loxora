import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startAppServer } from "@loxora/app";
import { defaultWorkspaceDirectory, runCli, settingsPath } from "@loxora/cli";
import { expect, type Page, test } from "@playwright/test";

/**
 * The setup conversation of Milestone 14 in script mode, as a person would go through it:
 * in German by tapping (apart from the name), in English by typing, opening an existing
 * workspace, looking around first, the not-understood reply, a resumed setup, and the first
 * Mission from the bridge. Every test has its own temporary LOXORA_HOME and Documents folder.
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
    answer: "Antwort an Xora",
    fits: "Passt so",
    newProject: "Neues Projekt starten",
    existingProject: "Bestehendes Projekt hinzufügen",
    later: "kommt in einer späteren Version",
    look: "Erst umsehen",
    game: "Ein Spiel",
    create: "Anlegen",
    toBridge: "Zur Brücke",
    projectCard: "Ich lege an: Projekt „Mein Spiel“.",
    firstMission: "Erste Mission",
    dismiss: "Nicht jetzt",
    start: "Starten",
    openMission: "Mission öffnen",
    option: "Für mich selbst",
    accept: "Übernehmen",
    next: "Weiter",
    template: "Ein eigenes Spiel entwickeln.\nFür wen: Für mich selbst.",
    openShip: "Dieses Schiff öffnen",
    notUnderstood: "Das verstehe ich noch nicht",
    terms: "Bordbegriffe",
    completed: "Abgeschlossen",
    bar: "Nachricht an Xora",
    send: "Senden",
    notOnBoard: "Ich bin in dieser Version noch nicht an Bord",
  },
  en: {
    answer: "Answer to Xora",
    projectCard: "I create: project “My game”.",
    toBridge: "To the bridge",
    firstMission: "First mission",
    dismiss: "Not now",
    notUnderstood: "I don't understand that yet",
  },
} as const;

/** Opens the app and waits until Xora asks for the name. */
async function start(page: Page, answer: string) {
  await page.goto(ship.url);
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByLabel(answer)).toBeEnabled();
}

async function say(page: Page, answer: string, text: string) {
  await page.getByLabel(answer).fill(text);
  await page.getByLabel(answer).press("Enter");
}

async function tap(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}

test.describe("German, by tapping", () => {
  test.use({ locale: "de-DE" });

  test("name typed, everything else tapped, then the first Mission from the bridge", async ({
    page,
  }) => {
    const text = TEXT.de;
    const errors = watchErrors(page);
    // Typefaces are bundled: requests to any other host fail.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
    await start(page, text.answer);
    await expect(page.getByText("Verbindung zum Kommandozentrum wird hergestellt")).toBeVisible();
    // Xora's picture is served with the app.
    const portrait = page.getByRole("img", { name: "Xora" });
    await expect(portrait).toBeVisible();
    await expect
      .poll(() => portrait.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    await say(page, text.answer, "Alex");
    await expect(page.getByRole("heading", { name: text.terms })).toBeVisible();
    await tap(page, "Nova");
    // Only the newest ship term is unfolded; the others open on a click.
    const captain = page.getByRole("button", { name: "Kapitän" });
    await expect(captain).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Logbuch" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await captain.click();
    await expect(captain).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Dokumente › Loxora")).toBeVisible();
    await tap(page, text.fits);
    await tap(page, text.newProject);
    await tap(page, text.game);
    await expect(page.getByText(text.projectCard)).toBeVisible();
    await tap(page, text.create);
    await tap(page, text.toBridge);
    await expect(page).toHaveURL(/\/missions$/);

    for (const family of ["Orbitron", "Exo 2", "Share Tech Mono"]) {
      const loaded = await page.evaluate(
        async (name) => (await document.fonts.load(`16px "${name}"`)).length,
        family,
      );
      expect(loaded, family).toBeGreaterThan(0);
    }

    // The first Mission is offered in the empty Mission list and in the banner.
    await page.getByRole("link", { name: text.firstMission }).first().click();
    await tap(page, text.start);
    await page.getByRole("link", { name: text.openMission }).click();
    await expect(page).toHaveURL(/\/missions\/[^/]+$/);
    await page.getByRole("button", { name: text.option }).click();
    await page.getByRole("link", { name: text.firstMission }).click();
    await expect(page.locator("textarea")).toHaveValue(text.template);
    await tap(page, text.next);
    await tap(page, text.accept);
    await tap(page, text.next);
    await tap(page, text.next);
    await tap(page, text.toBridge);
    await expect(page).toHaveURL(/\/missions$/);
    await expect(page.getByRole("link", { name: text.firstMission })).toHaveCount(0);
    await expect(page.getByText(text.completed).first()).toBeVisible();

    // The input bar answers with the fixed script-mode text.
    await page.getByLabel(text.bar, { exact: true }).fill("Hallo Xora");
    await page.getByRole("button", { name: text.send }).click();
    await expect(page.getByText(text.notOnBoard)).toBeVisible();

    const setup = settings().setup as Record<string, unknown>;
    expect(typeof setup.completedAt).toBe("string");
    expect(typeof setup.proposalId).toBe("string");
    expect(errors).toEqual([]);
  });

  test("looking around first ends the setup without a project", async ({ page }) => {
    const text = TEXT.de;
    await start(page, text.answer);
    await say(page, text.answer, "Alex");
    await tap(page, "Kepler");
    await tap(page, text.fits);
    // Shown, but not active: the button carries a "coming later" note.
    await page.getByRole("button", { name: text.existingProject }).click();
    await expect(page.getByText(text.later)).toBeVisible();
    await tap(page, text.look);
    await tap(page, text.toBridge);
    await expect(page).toHaveURL(/\/missions$/);
    await expect(page.getByRole("link", { name: text.firstMission })).toHaveCount(0);
    const setup = settings().setup as Record<string, unknown>;
    expect(typeof setup.completedAt).toBe("string");
    expect(setup.projectId).toBeUndefined();
  });

  test("an unknown answer gets the not-understood reply; a reload resumes", async ({ page }) => {
    const text = TEXT.de;
    await start(page, text.answer);
    await say(page, text.answer, "Alex");
    await say(page, text.answer, "Sternenfalke");
    await say(page, text.answer, "Banane");
    await expect(page.getByText(text.notUnderstood)).toBeVisible();
    await expect(page.getByRole("button", { name: text.fits })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Sternenfalke", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: text.fits })).toBeVisible();
    expect((settings().setup as Record<string, unknown>).shipName).toBe("Sternenfalke");
  });

  test("an existing workspace opens in place", async ({ page }) => {
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
    await start(page, text.answer);
    await expect(page.getByText("gefunden")).toBeVisible();
    await say(page, text.answer, "Alex");
    await tap(page, text.openShip);
    await expect(page.getByText("Willkommen zurück auf der Kepler.")).toBeVisible();
    await tap(page, text.look);
    await tap(page, text.toBridge);
    await expect(page).toHaveURL(/\/missions$/);
    expect(settings().workspacePath).toBe(workspace);
    expect(errors).toEqual([]);
  });
});

test.describe("English, by typing", () => {
  test.use({ locale: "en-US" });

  test("the whole setup typed; the first Mission offer can be dismissed", async ({ page }) => {
    const text = TEXT.en;
    const errors = watchErrors(page);
    await start(page, text.answer);
    await say(page, text.answer, "Alex Müller");
    await say(page, text.answer, "Enterprise");
    await say(page, text.answer, "Yes, that's fine");
    await say(page, text.answer, "I'd like to start a new project");
    await say(page, text.answer, "A small platform game for my kids.");
    await expect(page.getByText("I create: project “My game”.")).toBeVisible();
    await say(page, text.answer, "change the name");
    await say(page, text.answer, "Jumper");
    await expect(page.getByText("I create: project “Jumper”.")).toBeVisible();
    await say(page, text.answer, "yes");
    await say(page, text.answer, "banana");
    await expect(page.getByText(text.notUnderstood)).toBeVisible();
    await say(page, text.answer, "to the bridge");
    await expect(page).toHaveURL(/\/missions$/);

    const setup = settings().setup as Record<string, unknown>;
    expect(setup.purpose).toBe("A small platform game for my kids.");
    expect(settings().captain).toBe("alex-mueller");
    expect((settings() as { workspacePath: string }).workspacePath).toBe(
      join(ship.home, "Documents", "Loxora"),
    );

    await page.getByRole("button", { name: text.dismiss }).first().click();
    await expect(page.getByRole("link", { name: text.firstMission })).toHaveCount(0);
    expect(typeof (settings().setup as Record<string, unknown>).firstMissionDismissedAt).toBe(
      "string",
    );
    expect(errors).toEqual([]);
  });
});
