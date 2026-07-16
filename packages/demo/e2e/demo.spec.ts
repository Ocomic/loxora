import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Guided Demo remains server-derived from Prepared through real MCP parity", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/reset", { data: { stage: "Prepared" } });
  await page.goto("/?mode=guided");
  await expect(
    page.getByRole("heading", { name: "Projects should never lose their memory." }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Current guided step")
      .getByText("0 of 2 initial revisions accepted", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create the High impact assessment" })).toHaveCount(
    0,
  );

  const stageBeforeExplore = (await request.get("/api/demo/status")).json();
  await page.getByRole("button", { name: "Explore" }).click();
  await expect(page.getByRole("button", { name: "Explore" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Guided Demo" }).click();
  expect((await (await request.get("/api/demo/status")).json()).stage).toBe(
    (await stageBeforeExplore).stage,
  );

  await page.getByRole("button", { name: "Review the next V1 Proposal" }).first().click();
  await acceptFirst(page);
  await expect(page.getByRole("heading", { name: "Knowledge accepted" })).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByLabel("Current guided step")
      .getByText("1 of 2 initial revisions accepted", { exact: true }),
  ).toBeVisible();
  await acceptFirst(page);
  await expect(
    page.getByText("Both projects have Current V1 knowledge", { exact: true }),
  ).toBeVisible();

  await acceptFirst(page);
  await expect(page.getByText("The projects are connected", { exact: true })).toBeVisible();
  await expect(page.locator('.guided-stepper li[aria-current="step"]')).toContainText(
    "Introduce a breaking change",
  );
  await expect(page.locator(".result-summary")).toHaveCSS("display", "block");
  expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await page.locator("body").evaluate((element) => element.clientWidth),
  );
  await acceptFirst(page);
  await expect(page.getByRole("heading", { name: "Breaking revision accepted" })).toBeVisible();
  await expect(page.getByText("V1 → V2", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Impact" }).click();
  await page
    .locator("[data-main-content]")
    .getByRole("button", { name: "Create the High impact assessment" })
    .click();
  await expect(page.getByText("High compatibility impact detected", { exact: true })).toBeVisible();
  await expect(
    page.locator("[data-main-content]").getByText("High", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.locator("[data-main-content]").getByText("Relationship Stale", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.locator("[data-main-content]").getByText("Assessment Fresh", { exact: true }).first(),
  ).toBeVisible();
  await page
    .locator("[data-main-content]")
    .getByRole("button", { name: "Record the rollback" })
    .click();
  await expect(page.getByRole("heading", { name: "Rollback recorded" })).toBeVisible();
  await expect(page.getByText(/V1 was not reactivated/)).toBeVisible();

  await page.getByRole("link", { name: "Review Inbox" }).click();
  await acceptFirst(page);
  await expect(page.getByRole("heading", { name: "Compatibility restored" })).toBeVisible();

  const identity = "10000000-0000-4000-8000-000000000001";
  const tokenFormat = "10000000-0000-4000-8000-000000000004";
  await page.goto(`/projects/${identity}/nodes/${tokenFormat}?view=current&mode=guided`);
  await expect(page.getByText("Current", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "History" }).click();
  await expect(
    page.getByRole("heading", { name: "How project understanding changed" }),
  ).toBeVisible();
  await expect(page.locator(".timeline-marker")).toHaveText(["V1", "V2", "V3"]);
  await page.getByRole("link", { name: "Planned" }).click();
  await expect(
    page.getByText("Future intent, never Current instructions", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Blocked by", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Context Package" }).click();
  await page.getByRole("button", { name: "Build Current Context Package" }).click();
  const summary = page.locator(".context-result");
  await expect(summary.getByRole("heading", { name: "Context Package ready" })).toBeVisible();
  await expect(summary).toHaveCSS("display", "block");
  await expect(page.getByText(/This package was built by Core/)).toBeVisible();
  await expect(page.getByText(/Complete the server-provided lifecycle steps/)).toHaveCount(0);
  await expect(summary.locator(".summary-metrics")).toBeVisible();
  await expect(summary.locator(".technical-details")).toBeVisible();
  expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await page.locator("body").evaluate((element) => element.clientWidth),
  );
  await page.reload();
  await expect(page.getByText(/prepared Context request is ready/)).toBeVisible();
  await expect(page.getByText(/Complete the server-provided lifecycle steps/)).toHaveCount(0);

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
  await page.getByRole("link", { name: "MCP Proof" }).click();
  await expect(
    page.getByRole("heading", { name: "UI and MCP context match exactly" }),
  ).toBeVisible();
  await expect(page.getByText("✓ Match", { exact: true })).toHaveCount(8);
  await page.reload();
  await expect(page.getByText("UI and MCP Context match exactly", { exact: true })).toBeVisible();

  await page.locator(".topbar").getByRole("button", { name: "Reset to Prepared" }).click();
  await expect(
    page
      .getByLabel("Current guided step")
      .getByText("0 of 2 initial revisions accepted", { exact: true }),
  ).toBeVisible();
});

async function acceptFirst(page: import("@playwright/test").Page) {
  const button = page
    .locator("[data-main-content]")
    .getByRole("button", { name: "Accept and continue" })
    .first();
  await expect(button).toBeVisible();
  await button.click();
}
