import { validationError } from "../shared/errors.js";
import type { TaskDefinition, WorkflowDefinition } from "../shared/types.js";

export function getTaskMap(definition: WorkflowDefinition): Map<string, TaskDefinition> {
  return new Map(definition.tasks.map((task) => [task.id, task]));
}

export function getTaskOrThrow(
  definition: WorkflowDefinition,
  taskId: string | null,
): TaskDefinition {
  if (!taskId) {
    throw validationError("Run does not have a current task.");
  }

  const task = getTaskMap(definition).get(taskId);

  if (!task) {
    throw validationError(`Task '${taskId}' does not exist in the run snapshot.`);
  }

  return task;
}
