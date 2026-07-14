import { createId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import type {
  RunTaskEvent,
  TaskDefinition,
  WorkflowRunRecord,
} from "../shared/types.js";
import { evaluateBranch } from "./evaluateBranch.js";
import { getTaskOrThrow } from "./taskLookup.js";

export type EventAppender = (
  event: Omit<RunTaskEvent, "id" | "sequence">,
) => void;

export function advanceRun(
  run: WorkflowRunRecord,
  appendEvent: EventAppender,
): WorkflowRunRecord {
  let transitions = 0;

  while (run.status === "in_progress") {
    if (transitions > 100) {
      throw new Error("Workflow exceeded maximum automatic transitions.");
    }

    transitions += 1;
    const task = getTaskOrThrow(run.definitionSnapshot, run.currentTaskId);

    if (task.type === "data_entry") {
      if (run.currentStepIndex === null) {
        run.currentStepIndex = 0;
      }
      return run;
    }

    if (task.type === "branch") {
      const result = evaluateBranch(task, run.data);
      const completedAt = nowIso();

      appendEvent({
        runId: run.id,
        taskId: task.id,
        taskType: task.type,
        event: {
          taskId: task.id,
          type: task.type,
          completedAt,
          selectedTaskId: result.selectedTaskId,
          matchedRuleIndex: result.matchedRuleIndex,
          evaluations: result.evaluations,
        },
        createdAt: completedAt,
      });

      run.currentTaskId = result.selectedTaskId;
      run.currentStepIndex = null;
      continue;
    }

    completeTerminalTask(run, task, appendEvent);
    return run;
  }

  return run;
}

function completeTerminalTask(
  run: WorkflowRunRecord,
  task: Extract<TaskDefinition, { type: "terminal" }>,
  appendEvent: EventAppender,
): void {
  const completedAt = nowIso();

  appendEvent({
    runId: run.id,
    taskId: task.id,
    taskType: task.type,
    event: {
      taskId: task.id,
      type: task.type,
      completedAt,
    },
    createdAt: completedAt,
  });

  run.status = "completed";
  run.currentTaskId = null;
  run.currentStepIndex = null;
  run.stepDraft = null;
  run.completedAt = completedAt;
}

export function createTaskEvent(
  event: Omit<RunTaskEvent, "id" | "sequence">,
  sequence: number,
): RunTaskEvent {
  return {
    ...event,
    id: createId("evt"),
    sequence,
  };
}
