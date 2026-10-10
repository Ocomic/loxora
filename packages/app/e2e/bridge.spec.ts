import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { startAppServer } from "@loxora/app";
import { runCli } from "@loxora/cli";
import { expect, type Page, test } from "@playwright/test";

/**
 * The bridge as the ship's chat (Milestone 15, delivery 2) in script mode, on a workspace with
 * one project and a Mission that waits for the captain. The app runs with a fixed workspace
 * and the captain as actor.
 */
let url: string;
let workspace: string;
let close: () => Promise<void>;

async function cli(...argv: string[]): Promise<Record<string, unknown>> {
  let stdout = "";
  const code = await runCli([...argv, "--workspace", workspace, "--json"], {
    env: {},
    cwd: workspace,
    stdout: (text) => {
      stdout += text;
    },
    stderr: () => undefined,
  });
  expect(code, argv.join(" ")).toBe(0);
  return JSON.parse(stdout) as Record<string, unknown>;
}

test.beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), "loxora-e2e-bridge-"));
  workspace = join(root, "ws");
  const agent = ["--actor", "agent:codex"];
  await cli("workspace", "init", "--reviewer", "Ocomic", "--name", "Nova");
  await cli("project", "add", "--name", "Spiel", ...agent);
  const mission = await cli(
    "mission",
    "create",
    "--project",
    "Spiel",
    "--title",
    "Texturgröße wählen",
    "--goal",
    "LOD2-Texturen festlegen",
    ...agent,
  );
  await cli("mission", "start", "--mission", String(mission.id), ...agent);
  await cli(
    "mission",
    "wait",
    "--mission",
    String(mission.id),
    "--reason",
    "needs_input",
    "--question",
    "512 oder 1024?",
    "--why",
    "Beides passt",
    ...agent,
  );
  const server = await startAppServer({ workspaceDirectory: workspace, port: 0, actor: "Ocomic" });
  url = server.url;
  close = async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  };
});

test.afterEach(async () => {
  await close();
});

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

const side = (page: Page) =>
  page.getByRole("navigation", { name: /Kanäle und Chats|Channels and chats/ });

test.describe("Deutsch", () => {
  test.use({ locale: "de-DE" });

  test("the decisions channel leads to the open question; answering and writing in its thread", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(url);
    await expect(page).toHaveURL(/\/bridge$/);
    await expect(page.getByRole("heading", { name: "#brücke" })).toBeVisible();
    await expect(page.getByText("Projekt „Spiel“ angelegt.")).toBeVisible();
    await expect(
      page.getByText("Mission „Texturgröße wählen“ wartet auf den Kapitän."),
    ).toBeVisible();

    // Red, first in the side list, with a counter.
    const decisions = side(page).getByRole("link", { name: /#entscheidungen/ });
    await expect(decisions).toContainText("1");
    await decisions.click();
    await expect(page.getByText("512 oder 1024?")).toBeVisible();
    await page.getByRole("button", { name: "Zum Thread" }).click();
    await expect(page).toHaveURL(/\/bridge\/project%3A.+\?thread=mission%3A/);
    const thread = page.locator(".bridge-thread");
    await expect(thread.getByRole("heading", { name: "Texturgröße wählen" })).toBeVisible();

    // A message without @Xora is stored without a reply; with @Xora she answers in place.
    await thread.getByRole("textbox", { name: "Nachricht" }).fill("Ich schaue es mir an.");
    await thread.getByRole("button", { name: "Senden" }).click();
    await expect(thread.getByText("Ich schaue es mir an.")).toBeVisible();
    await expect(thread.getByText("noch nicht an Bord")).toHaveCount(0);
    const input = thread.getByRole("textbox", { name: "Nachricht" });
    await input.fill("Was meinst du, @");
    // Typing @ offers the participants; Tab takes the offer.
    await expect(thread.getByRole("button", { name: "@Xora" })).toBeVisible();
    await input.press("Tab");
    await expect(input).toHaveValue("Was meinst du, @Xora ");
    await input.press("Enter");
    await expect(thread.getByText(/Ich bin in dieser Version noch nicht an Bord/)).toBeVisible();

    // Answering is the Milestone 12 write; the decisions channel empties.
    await thread.getByLabel("Deine Antwort").fill("512");
    await thread.getByRole("button", { name: "Antworten" }).click();
    await expect(thread.getByRole("heading", { name: /Antwort erhalten/ })).toBeVisible();
    await expect(decisions).not.toContainText("1");
    await expect(page.locator(".entry-mission")).toContainText("3 Antworten");

    // A channel message without @Xora gets no reply.
    const chat = page.locator(".bridge-chat");
    await page.getByRole("button", { name: "Thread schließen" }).click();
    await chat.getByRole("textbox", { name: "Nachricht" }).fill("Guten Morgen, Crew");
    await chat.getByRole("textbox", { name: "Nachricht" }).press("Enter");
    await expect(chat.getByText("Guten Morgen, Crew")).toBeVisible();
    await expect(chat.locator(".avatar-xora")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("Xora's direct chat starts a topic thread per message", async ({ page }) => {
    await page.goto(`${url}/bridge`);
    await side(page).getByRole("link", { name: "Xora" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Xora" })).toBeVisible();
    await expect(page.getByText("Online · Skriptmodus")).toBeVisible();
    await page.getByRole("textbox", { name: "Nachricht" }).fill("Hallo Xora");
    await page.getByRole("textbox", { name: "Nachricht" }).press("Enter");
    const thread = page.locator(".bridge-thread");
    await expect(thread.getByText(/noch nicht an Bord/)).toBeVisible();
    await expect(page).toHaveURL(/thread=message%3A/);
    await expect(page.locator(".bridge-chat")).toContainText("1 Antwort");
  });

  test("a message link shows a preview and jumps to the message", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url });
    await page.goto(`${url}/bridge`);
    const chat = page.locator(".bridge-chat");
    await chat.getByRole("textbox", { name: "Nachricht" }).fill("Kurs auf Kepler setzen");
    await chat.getByRole("textbox", { name: "Nachricht" }).press("Enter");
    const message = chat.locator(".entry-message", { hasText: "Kurs auf Kepler setzen" });
    await message.getByLabel("Nachrichten-Menü").click();
    await message.getByRole("button", { name: "Link kopieren" }).click();
    await expect(message.getByText("Link kopiert")).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/bridge\/m\/[0-9a-f-]+$/);

    await side(page).getByRole("link", { name: "Xora" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Xora" })).toBeVisible();
    await page.getByRole("textbox", { name: "Nachricht" }).fill(`Bitte merken: ${link}`);
    await page.getByRole("textbox", { name: "Nachricht" }).press("Enter");
    const preview = page.locator(".bridge-thread .preview-card");
    await expect(preview).toContainText("Verlinkte Nachricht · #brücke");
    await expect(preview).toContainText("Kurs auf Kepler setzen");
    await preview.click();
    await expect(page).toHaveURL(/\/bridge\/ship\?message=/);
    await expect(page.locator(".entry-highlighted")).toContainText("Kurs auf Kepler setzen");

    // Opening the link itself lands on the same message.
    await page.goto(link);
    await expect(page.locator(".entry-highlighted")).toContainText("Kurs auf Kepler setzen");
  });
});

test.describe("English", () => {
  test.use({ locale: "en-US" });

  test("a task channel is created, renamed, and archived; a message is deleted", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(`${url}/bridge`);
    await side(page).getByRole("button", { name: "New channel" }).click();
    await side(page).getByLabel("Channel name").fill("Level design");
    await side(page).getByLabel("Project (optional)").selectOption({ label: "Spiel" });
    await side(page).getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "#Level design" })).toBeVisible();

    const chat = page.locator(".bridge-chat");
    await chat.getByLabel("Channel menu").click();
    await chat.getByRole("button", { name: "Rename" }).click();
    await chat.getByLabel("Channel name").fill("Levels");
    await chat.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "#Levels" })).toBeVisible();
    await expect(side(page).getByRole("link", { name: "#Levels" })).toBeVisible();

    await chat.getByRole("textbox", { name: "Message" }).fill("World 1 sketch");
    await chat.getByRole("textbox", { name: "Message" }).press("Enter");
    await chat.getByRole("textbox", { name: "Message" }).fill("Typo here");
    await chat.getByRole("textbox", { name: "Message" }).press("Enter");
    const typo = chat.locator(".entry-message", { hasText: "Typo here" });
    await typo.getByLabel("Message menu").click();
    await typo.getByRole("button", { name: "Delete" }).click();
    await expect(chat.getByText("Message deleted")).toBeVisible();
    await expect(chat.getByText("Typo here")).toHaveCount(0);

    await chat.getByLabel("Channel menu").click();
    await chat.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "#bridge" })).toBeVisible();
    await expect(side(page).getByRole("link", { name: "#Levels" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("below 900 pixels the side list and the details fold away", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto(`${url}/bridge`);
    await expect(side(page)).toBeHidden();
    await page.getByRole("button", { name: "Channels" }).click();
    await expect(side(page)).toBeVisible();
    await side(page).getByRole("link", { name: "Xora" }).click();
    await expect(side(page)).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    await page.getByRole("button", { name: "Details" }).click();
    await expect(page.getByText("Online · script mode")).toBeVisible();
    await page.getByRole("button", { name: "Hide" }).click();
    await expect(page.getByText("Online · script mode")).toBeHidden();
  });

  test("without migration 008_chat the bridge is read-only with the migration hint", async ({
    page,
  }) => {
    const database = new DatabaseSync(join(workspace, "workspace.sqlite"));
    database.exec(`DROP TABLE chat_message_references; DROP TABLE chat_messages;
      DROP TABLE chats; DELETE FROM schema_migrations WHERE id = '008_chat';`);
    database.close();
    await page.goto(`${url}/bridge`);
    await expect(page.getByText(/not up to date for the bridge chat/)).toBeVisible();
    await expect(page.getByText("Project “Spiel” created.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
    await expect(side(page).getByRole("button", { name: "New channel" })).toHaveCount(0);
  });
});
