import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/db/connection.js";
import { migrate } from "../src/db/schema.js";
import { parseWorkflowDefinitionInput } from "../src/workflow-definitions/validation.js";
import { WorkflowDefinitionService } from "../src/workflow-definitions/service.js";
import { WorkflowRunService } from "../src/workflow-runs/service.js";

const definition = JSON.parse(
  fs.readFileSync("examples/purchase-approval-definition.json", "utf8"),
) as Record<string, unknown>;

let db: Db;
let definitionService: WorkflowDefinitionService;
let runService: WorkflowRunService;

beforeEach(() => {
  db = createDb(":memory:");
  migrate(db);
  definitionService = new WorkflowDefinitionService(db);
  runService = new WorkflowRunService(db);
});

afterEach(() => {
  db.close();
});

describe("workflow engine", () => {
  it("completes the fallback branch for a low amount", () => {
    const createdDefinition = createDefinition();
    const run = runService.start(createdDefinition.id);

    const completedRun = runService.submit(run.id, "finish", {
      amount: 300,
      description: "Keyboard purchase",
    });

    expect(completedRun.status).toBe("completed");
    expect(pathOf(completedRun)).toEqual([
      "enter_request",
      "route_by_amount",
      "auto_approve",
    ]);
    expect(completedRun.doneTasks[1]).toMatchObject({
      selectedTaskId: "auto_approve",
      matchedRuleIndex: null,
      evaluations: [
        {
          left: "enter_request.amount",
          leftValue: 300,
          operator: "gt",
          rightValue: 500,
          matched: false,
        },
      ],
    });
  });

  it("routes to manager review for a high amount and then completes", () => {
    const createdDefinition = createDefinition();
    const run = runService.start(createdDefinition.id);

    const waitingRun = runService.submit(run.id, "finish", {
      amount: 900,
      description: "Laptop purchase",
    });

    expect(waitingRun.status).toBe("in_progress");
    expect(waitingRun.activeTask?.id).toBe("manager_review");
    expect(pathOf(waitingRun)).toEqual(["enter_request", "route_by_amount"]);

    const completedRun = runService.submit(run.id, "finish", {
      manager_note: "Approved for onboarding.",
    });

    expect(completedRun.status).toBe("completed");
    expect(pathOf(completedRun)).toEqual([
      "enter_request",
      "route_by_amount",
      "manager_review",
      "approved_after_review",
    ]);
  });

  it("saves progress without completing the active task", () => {
    const createdDefinition = createDefinition();
    const run = runService.start(createdDefinition.id);

    const savedRun = runService.submit(run.id, "save", {
      amount: 450,
    });

    expect(savedRun.status).toBe("in_progress");
    expect(savedRun.activeTask?.id).toBe("enter_request");
    expect(savedRun.activeTask?.savedData).toEqual({ amount: 450 });
    expect(savedRun.doneTasks).toEqual([]);
    expect(savedRun.data.enter_request).toEqual({ amount: 450 });
  });

  it("cancels an in-progress run and rejects further submissions", () => {
    const createdDefinition = createDefinition();
    const run = runService.start(createdDefinition.id);

    const canceledRun = runService.cancel(run.id);

    expect(canceledRun.status).toBe("canceled");
    expect(canceledRun.activeTask).toBeNull();

    expect(() =>
      runService.submit(run.id, "finish", {
        amount: 300,
        description: "Keyboard purchase",
      }),
    ).toThrow("is not in progress");
  });
});

function createDefinition() {
  return definitionService.create(parseWorkflowDefinitionInput(definition));
}

function pathOf(run: { doneTasks: Record<string, unknown>[] }): unknown[] {
  return run.doneTasks.map((task) => task.taskId);
}
