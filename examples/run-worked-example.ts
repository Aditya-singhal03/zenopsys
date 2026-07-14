import fs from "node:fs";
import { createDb } from "../src/db/connection.js";
import { migrate } from "../src/db/schema.js";
import { parseWorkflowDefinitionInput } from "../src/workflow-definitions/validation.js";
import { WorkflowDefinitionService } from "../src/workflow-definitions/service.js";
import { WorkflowRunService } from "../src/workflow-runs/service.js";

const definition = JSON.parse(
  fs.readFileSync("examples/purchase-approval-definition.json", "utf8"),
) as Record<string, unknown>;

const db = createDb(":memory:");
migrate(db);

const definitionService = new WorkflowDefinitionService(db);
const runService = new WorkflowRunService(db);

try {
  const createdDefinition = definitionService.create(
    parseWorkflowDefinitionInput(definition),
  );

  const lowRun = runService.start(createdDefinition.id);
  const completedLowRun = runService.submit(lowRun.id, "finish", {
      amount: 300,
      description: "Keyboard purchase",
  });

  const highRun = runService.start(createdDefinition.id);
  const waitingHighRun = runService.submit(highRun.id, "finish", {
      amount: 900,
      description: "Laptop purchase",
  });
  const completedHighRun = runService.submit(highRun.id, "finish", {
      manager_note: "Approved for onboarding.",
  });

  console.log("Low amount path:", pathOf(completedLowRun));
  console.log("Low amount status:", completedLowRun.status);
  console.log("High amount active task after first submit:", waitingHighRun.activeTask?.id);
  console.log("High amount path:", pathOf(completedHighRun));
  console.log("High amount status:", completedHighRun.status);
} finally {
  db.close();
}

function pathOf(run: Record<string, any>): string {
  return run.doneTasks.map((task: Record<string, unknown>) => task.taskId).join(" -> ");
}
