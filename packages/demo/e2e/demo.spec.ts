import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Prepared to V3, Context Package, and real MCP proof", async ({ page, request }) => {
  await request.post("/api/demo/reset", { data: { stage: "Prepared" } });
  await page.goto("/");
  await expect(page.getByText("Prepared", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Review Inbox" }).click();
  for (let index = 0; index < 4; index += 1) {
    const currentCard = page.locator("article.card").first();
    const currentId = await currentCard.locator(".mono").textContent();
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/api/reviews/") && response.status() === 200,
      ),
      page.getByRole("button", { name: "Accept" }).first().click(),
    ]);
    if (currentId) await expect(page.getByText(currentId, { exact: true })).toBeHidden();
  }
  await page.getByRole("link", { name: "Impact" }).click();
  await page.getByRole("button", { name: "Create High V2 assessment" }).click();
  await page.getByRole("button", { name: "Record rollback" }).click();
  await page.getByRole("link", { name: "Review Inbox" }).click();
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByRole("link", { name: "Context Package" }).click();
  await page.getByRole("button", { name: "Build Current Context Package" }).click();
  await expect(page.getByText(/fingerprint/)).toBeVisible();
  execFileSync(
    process.execPath,
    [
      resolve(
        process.cwd(),
        "packages",
        "demo",
        "dist",
        "src",
        "orchestration",
        "mcp-proof-cli.js",
      ),
    ],
    { cwd: process.cwd(), stdio: "inherit" },
  );
  await page.getByRole("link", { name: "MCP proof" }).click();
  await expect(page.getByText(/passed/)).toBeVisible();
});
