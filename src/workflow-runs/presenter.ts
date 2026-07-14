import type {
  ActiveTask,
  DataEntryStep,
  RunTaskEvent,
  WorkflowRunRecord,
  WorkflowRunResponse,
} from "../shared/types.js";
import { getTaskOrThrow } from "../engine/taskLookup.js";

export function presentRun(
  run: WorkflowRunRecord,
  events: RunTaskEvent[],
): WorkflowRunResponse {
  return {
    id: run.id,
    definitionId: run.definitionId,
    status: run.status,
    activeTask: presentActiveTask(run),
    doneTasks: events.map((event) => event.event),
    data: run.data,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
    canceledAt: run.canceledAt,
  };
}

function presentActiveTask(run: WorkflowRunRecord): ActiveTask | null {
  if (run.status !== "in_progress") {
    return null;
  }

  const task = getTaskOrThrow(run.definitionSnapshot, run.currentTaskId);

  if (task.type !== "data_entry") {
    return null;
  }

  const stepIndex = run.currentStepIndex ?? 0;
  const step = task.steps[stepIndex];

  if (!step) {
    return null;
  }

  return {
    id: task.id,
    type: task.type,
    name: task.name,
    currentStep: {
      ...step,
      index: stepIndex,
    } satisfies DataEntryStep & { index: number },
    savedData: getSavedDataForCurrentStep(run, task.id, step, stepIndex),
  };
}

function getSavedDataForCurrentStep(
  run: WorkflowRunRecord,
  taskId: string,
  step: DataEntryStep,
  stepIndex: number,
): Record<string, unknown> {
  if (
    run.stepDraft &&
    run.stepDraft.taskId === taskId &&
    run.stepDraft.stepIndex === stepIndex
  ) {
    return run.stepDraft.data;
  }

  const taskData = run.data[taskId] ?? {};
  const currentFieldIds = new Set(step.fields.map((field) => field.id));

  return Object.fromEntries(
    Object.entries(taskData).filter(([fieldId]) => currentFieldIds.has(fieldId)),
  );
}
