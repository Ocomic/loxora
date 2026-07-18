import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Guided Demo remains server-derived from Prepared through real MCP parity", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/reset", { data: { stage: "Prepared" } });
  await page.goto("/?mode=guided");
  const logo = page.locator(".brand-logo-image");
  await expect(logo).toHaveAttribute("src", "/loxora-logo.png");
  await expect
    .poll(() =>
      logo.evaluate((image: HTMLImageElement) => `${image.naturalWidth}x${image.naturalHeight}`),
    )
    .toBe("1080x420");
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
  await expect(
    page.getByRole("button", { name: "Review the next V1 Proposal" }).last(),
  ).toBeVisible();
  await page
    .locator(".result-summary")
    .getByRole("button", { name: "Review the next V1 Proposal" })
    .click();
  await expect(page.locator("[data-guided-action-target='true']")).toBeFocused();
  await expect(
    page.locator("[data-guided-action-target='true']").getByRole("button", {
      name: "Accept and continue",
    }),
  ).toBeVisible();
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

  await page
    .locator(".result-summary")
    .getByRole("button", { name: "Review the DependsOn relationship" })
    .click();
  const relationshipReview = page.locator("[data-guided-action-target='true']");
  await expect(relationshipReview).toBeFocused();
  await expect(relationshipReview).toContainText("Cross-project dependency");
  await acceptFirst(page);
  await expect(page.getByText("The projects are connected", { exact: true })).toBeVisible();
  await expect(page.locator('.guided-stepper li[aria-current="step"]')).toContainText(
    "Introduce a breaking change",
  );
  await expect(page.locator(".result-summary")).toHaveCSS("display", "block");
  expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await page.locator("body").evaluate((element) => element.clientWidth),
  );
  await page.locator(".result-summary").getByRole("button", { name: "Review breaking V2" }).click();
  const breakingReview = page.locator("[data-guided-action-target='true']");
  await expect(breakingReview).toBeFocused();
  await expect(breakingReview).toContainText("Breaking contract change");
  await acceptFirst(page);
  await expect(page.getByRole("heading", { name: "Breaking revision accepted" })).toBeVisible();
  await expect(page.getByText("V1 → V2", { exact: true })).toBeVisible();
  await expect(page.locator("output")).toHaveCount(0);
  await expect(page.locator(".topbar")).toHaveCSS("backdrop-filter", "none");
  expect(await page.locator(".result-summary").evaluate((element) => element.tagName)).toBe(
    "SECTION",
  );

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
  await page.getByRole("button", { name: "Compare Current, History, and Planned" }).last().click();
  const temporalHeading = page.locator("[data-route-focus-target='true']");
  await expect(temporalHeading).toBeFocused();
  await expect(page.getByRole("heading", { name: "Compare knowledge across time" })).toBeVisible();
  const temporalComparison = page.getByLabel("Temporal knowledge comparison");
  await expect(
    temporalComparison.getByText("Currently valid knowledge", { exact: true }),
  ).toBeVisible();
  await expect(
    temporalComparison.getByText("Earlier versions remain traceable", { exact: true }),
  ).toBeVisible();
  await expect(
    temporalComparison.getByText("Planned change, not current guidance", { exact: true }),
  ).toBeVisible();
  await expect(temporalComparison.getByRole("heading", { name: "V1 → V2 → V3" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm the temporal separation" }).click();
  await expect(page.locator('.guided-stepper li[aria-current="step"]')).toContainText(
    "Build the task-specific Context Package",
  );
  await page.getByRole("button", { name: "Build Current Context Package" }).click();
  const summary = page.locator(".context-result");
  await expect(summary.getByRole("heading", { name: "Context Package ready" })).toBeVisible();
  await expect(summary).toHaveCSS("display", "block");
  expect(await summary.evaluate((element) => element.tagName)).toBe("SECTION");
  await expect(page.getByText(/This package was built by Core/)).toBeVisible();
  await expect(page.getByText(/Complete the server-provided lifecycle steps/)).toHaveCount(0);
  await expect(summary.locator(".summary-metrics")).toBeVisible();
  await expect(summary.locator(".context-narrative")).toContainText(
    "Use Token Format V3 when updating the Token Parser",
  );
  await expect(summary.locator(".technical-details")).toBeVisible();
  expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await page.locator("body").evaluate((element) => element.clientWidth),
  );
  await page.reload();
  await expect(page.getByText(/prepared Context request is ready/)).toBeVisible();
  await expect(page.getByText(/Complete the server-provided lifecycle steps/)).toHaveCount(0);
  await page.locator(".result-summary").getByRole("button", { name: "Verify MCP parity" }).click();
  await expect(page.getByRole("heading", { name: "MCP parity proof" })).toBeVisible();
  await expect(page.getByText("npm run demo:mcp:proof", { exact: true })).toBeVisible();

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
  await page.locator(".guidance-panel").getByRole("button", { name: "Verify MCP parity" }).click();
  await expect(
    page.getByRole("heading", { name: "Project knowledge survived change and stayed usable." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "UI and MCP context match exactly" }),
  ).toBeVisible();
  await expect(page.getByText("✓ Match", { exact: true })).toHaveCount(8);
  await expect(page.getByRole("heading", { name: "Where Loxora can go next" })).toBeVisible();
  await expect(page.getByText(/not implemented in this demo/i)).toBeVisible();
  expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await page.locator("body").evaluate((element) => element.clientWidth),
  );
  await page.reload();
  await expect(page.getByText("UI and MCP Context match exactly", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Project knowledge survived change and stayed usable." }),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".topbar").getByRole("button", { name: "Reset to Prepared" }).click();
  await expect(
    page
      .getByLabel("Current guided step")
      .getByText("0 of 2 initial revisions accepted", { exact: true }),
  ).toBeVisible();
});

test("Rejected demo Proposals remain preserved and can be replaced", async ({ page, request }) => {
  await request.post("/api/demo/reset", { data: { stage: "Prepared" } });

  const rejectReplaceAndAccept = async (kind: string, nextAction: string) => {
    await page.goto("/reviews?mode=guided");
    const before = (await (await request.get("/api/review-inbox")).json()) as InboxItem[];
    const original = before.find((item) => inboxKind(item) === kind);
    expect(original, `${kind} Proposal should be submitted`).toBeTruthy();
    const originalCard = page.locator(`[data-proposal-id="${original?.id}"]`);
    await originalCard.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByRole("heading", { name: "Proposal rejected" })).toBeVisible();
    await expect(page.getByText(/Rejected Review Decision is preserved/)).toBeVisible();

    await page
      .locator(".result-summary")
      .getByRole("button", { name: "Prepare a new Proposal" })
      .click();
    await expect(page.getByRole("heading", { name: "New Proposal prepared" })).toBeVisible();
    await expect(page.getByText(/rejected Decision remains preserved/)).toBeVisible();

    const after = (await (await request.get("/api/review-inbox")).json()) as InboxItem[];
    const previousIds = new Set(before.map((item) => item.id));
    const replacement = after.find((item) => inboxKind(item) === kind && !previousIds.has(item.id));
    expect(replacement, `${kind} replacement should use a new ID`).toBeTruthy();

    await page.locator(".result-summary").getByRole("button", { name: nextAction }).click();
    const replacementCard = page.locator(`[data-proposal-id="${replacement?.id}"]`);
    await expect(replacementCard).toBeVisible();
    await replacementCard.getByRole("button", { name: "Accept and continue" }).click();
  };

  await rejectReplaceAndAccept("Initial", "Review the next V1 Proposal");
  await expect
    .poll(async () => (await (await request.get("/api/demo/status")).json()).guided.progressDetail)
    .toBe("1 of 2 initial revisions accepted");

  await page.goto("/reviews?mode=guided");
  await acceptFirst(page);
  await expect
    .poll(async () => (await (await request.get("/api/demo/status")).json()).stage)
    .toBe("V1Accepted");

  await rejectReplaceAndAccept("Relationship", "Review the DependsOn relationship");
  await expect
    .poll(async () => (await (await request.get("/api/demo/status")).json()).stage)
    .toBe("DependencyAccepted");

  await rejectReplaceAndAccept("Successor", "Review breaking V2");
  await expect
    .poll(async () => (await (await request.get("/api/demo/status")).json()).stage)
    .toBe("V2Accepted");

  await request.post("/api/demo/assess-impact", { data: {} });
  await request.post("/api/demo/rollback", { data: {} });
  await expect
    .poll(async () => (await (await request.get("/api/demo/status")).json()).stage)
    .toBe("RollbackRecorded");

  await rejectReplaceAndAccept("Restoration", "Review restoration V3");
  await expect
    .poll(async () => (await (await request.get("/api/demo/status")).json()).stage)
    .toBe("V3Restored");
});

interface InboxItem {
  readonly id: string;
  readonly kind: string;
  readonly proposal?: { readonly kind: string } | null;
}

function inboxKind(item: InboxItem): string {
  return item.kind === "CrossProjectRelationshipProposal"
    ? "Relationship"
    : (item.proposal?.kind ?? "Unknown");
}

async function acceptFirst(page: import("@playwright/test").Page) {
  const button = page
    .locator("[data-main-content]")
    .getByRole("button", { name: "Accept and continue" })
    .first();
  await expect(button).toBeVisible();
  await button.click();
}
