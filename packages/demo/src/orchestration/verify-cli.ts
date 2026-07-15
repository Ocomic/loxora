import { DemoCoordinator } from "./coordinator.js";
const demo = new DemoCoordinator();
try {
  await demo.open();
  const status = await demo.status();
  if (!status.databaseConnected || status.highestMigrationId !== "005_planned_knowledge")
    throw new Error("Demo diagnostics failed");
  process.stdout.write(
    `Demo verified at stage ${status.stage}; migration ${status.highestMigrationId}\n`,
  );
} finally {
  await demo.close();
}
