import { DemoCoordinator } from "./coordinator.js";
import { DEMO_STAGES, type DemoStage } from "../shared/contracts.js";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const raw = process.argv.includes("--stage")
  ? process.argv[process.argv.indexOf("--stage") + 1]
  : "Prepared";
if (!DEMO_STAGES.includes(raw as DemoStage)) throw new Error(`Unknown demo stage: ${raw}`);
const demo = new DemoCoordinator();
try {
  let status = await demo.reset(raw as DemoStage);
  if (raw === "Complete") {
    await demo.close();
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
      { stdio: "inherit" },
    );
    await demo.open();
    status = await demo.status();
  }
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
} finally {
  await demo.close();
}
