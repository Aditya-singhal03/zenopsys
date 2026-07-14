import { z } from "zod";
import { validationError, type ErrorDetail } from "../shared/errors.js";
import type {
  BranchOperand,
  TaskDefinition,
  WorkflowDefinitionInput,
} from "../shared/types.js";

const idSchema = z.string().min(1);

const selectOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const baseFieldSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  required: z.boolean().optional(),
});

const fieldSchema = z.discriminatedUnion("type", [
  baseFieldSchema.extend({
    type: z.literal("text"),
  }),
  baseFieldSchema.extend({
    type: z.literal("number"),
  }),
  baseFieldSchema.extend({
    type: z.literal("single_select"),
    options: z.array(selectOptionSchema).min(1),
  }),
  baseFieldSchema.extend({
    type: z.literal("multi_select"),
    options: z.array(selectOptionSchema).min(1),
  }),
]);

const dataEntryTaskSchema = z.object({
  id: idSchema,
  type: z.literal("data_entry"),
  name: z.string().min(1),
  nextTaskId: idSchema,
  steps: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1),
        fields: z.array(fieldSchema).min(1),
      }),
    )
    .min(1),
});

const branchOperandSchema = z.object({
  var: z.string().regex(/^[^.]+\.[^.]+$/, {
    message: "Variable references must use <taskId>.<fieldId>.",
  }),
});

const branchLiteralSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
]);

const branchConditionSchema = z.object({
  left: branchOperandSchema,
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"]),
  right: z.union([branchOperandSchema, branchLiteralSchema]),
});

const branchTaskSchema = z.object({
  id: idSchema,
  type: z.literal("branch"),
  name: z.string().min(1),
  rules: z
    .array(
      z.object({
        when: branchConditionSchema,
        nextTaskId: idSchema,
      }),
    )
    .min(1),
  fallbackTaskId: idSchema,
});

const terminalTaskSchema = z
  .object({
    id: idSchema,
    type: z.literal("terminal"),
    name: z.string().min(1),
  })
  .strict();

const taskSchema = z.discriminatedUnion("type", [
  dataEntryTaskSchema,
  branchTaskSchema,
  terminalTaskSchema,
]);

const workflowDefinitionInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startTaskId: idSchema,
  tasks: z.array(taskSchema).min(1),
});

export function parseWorkflowDefinitionInput(
  body: unknown,
): WorkflowDefinitionInput {
  const result = workflowDefinitionInputSchema.safeParse(body);

  if (!result.success) {
    throw validationError(
      "Workflow definition is invalid.",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  validateWorkflowGraph(result.data);
  return result.data;
}

function validateWorkflowGraph(definition: WorkflowDefinitionInput): void {
  const details: ErrorDetail[] = [];
  const taskIds = new Set<string>();
  const duplicatedTaskIds = new Set<string>();

  for (const task of definition.tasks) {
    if (taskIds.has(task.id)) {
      duplicatedTaskIds.add(task.id);
    }
    taskIds.add(task.id);
  }

  for (const taskId of duplicatedTaskIds) {
    details.push({
      path: "tasks",
      message: `Duplicate task id '${taskId}'.`,
    });
  }

  if (!taskIds.has(definition.startTaskId)) {
    details.push({
      path: "startTaskId",
      message: `startTaskId '${definition.startTaskId}' does not reference an existing task.`,
    });
  }

  for (const task of definition.tasks) {
    validateTaskReferences(task, taskIds, details);
    validateUniqueStepAndFieldIds(task, details);
    validateBranchVariableReferences(task, definition.tasks, details);
  }

  if (details.length > 0) {
    throw validationError("Workflow definition graph is invalid.", details);
  }
}

function validateTaskReferences(
  task: TaskDefinition,
  taskIds: Set<string>,
  details: ErrorDetail[],
): void {
  if (task.type === "data_entry" && !taskIds.has(task.nextTaskId)) {
    details.push({
      path: `tasks.${task.id}.nextTaskId`,
      message: `nextTaskId '${task.nextTaskId}' does not reference an existing task.`,
    });
  }

  if (task.type === "branch") {
    if (!taskIds.has(task.fallbackTaskId)) {
      details.push({
        path: `tasks.${task.id}.fallbackTaskId`,
        message: `fallbackTaskId '${task.fallbackTaskId}' does not reference an existing task.`,
      });
    }

    task.rules.forEach((rule, index) => {
      if (!taskIds.has(rule.nextTaskId)) {
        details.push({
          path: `tasks.${task.id}.rules.${index}.nextTaskId`,
          message: `nextTaskId '${rule.nextTaskId}' does not reference an existing task.`,
        });
      }
    });
  }
}

function validateUniqueStepAndFieldIds(
  task: TaskDefinition,
  details: ErrorDetail[],
): void {
  if (task.type !== "data_entry") {
    return;
  }

  const stepIds = new Set<string>();

  for (const step of task.steps) {
    if (stepIds.has(step.id)) {
      details.push({
        path: `tasks.${task.id}.steps`,
        message: `Duplicate step id '${step.id}'.`,
      });
    }
    stepIds.add(step.id);

    const fieldIds = new Set<string>();
    for (const field of step.fields) {
      if (fieldIds.has(field.id)) {
        details.push({
          path: `tasks.${task.id}.steps.${step.id}.fields`,
          message: `Duplicate field id '${field.id}'.`,
        });
      }
      fieldIds.add(field.id);

      if (
        (field.type === "single_select" || field.type === "multi_select") &&
        new Set(field.options.map((option) => option.value)).size !==
          field.options.length
      ) {
        details.push({
          path: `tasks.${task.id}.steps.${step.id}.fields.${field.id}.options`,
          message: "Select option values must be unique.",
        });
      }
    }
  }
}

function validateBranchVariableReferences(
  task: TaskDefinition,
  tasks: TaskDefinition[],
  details: ErrorDetail[],
): void {
  if (task.type !== "branch") {
    return;
  }

  const dataEntryTasks = new Map(
    tasks
      .filter((candidate) => candidate.type === "data_entry")
      .map((candidate) => [candidate.id, candidate]),
  );

  task.rules.forEach((rule, index) => {
    validateOperand(rule.when.left, dataEntryTasks, details, task.id, index, "left");

    if (isBranchOperand(rule.when.right)) {
      validateOperand(
        rule.when.right,
        dataEntryTasks,
        details,
        task.id,
        index,
        "right",
      );
    }
  });
}

function validateOperand(
  operand: BranchOperand,
  dataEntryTasks: Map<string, Extract<TaskDefinition, { type: "data_entry" }>>,
  details: ErrorDetail[],
  taskId: string,
  ruleIndex: number,
  side: "left" | "right",
): void {
  const [referencedTaskId, referencedFieldId] = operand.var.split(".");
  const referencedTask = dataEntryTasks.get(referencedTaskId);

  if (!referencedTask) {
    details.push({
      path: `tasks.${taskId}.rules.${ruleIndex}.when.${side}`,
      message: `Variable '${operand.var}' does not reference a data-entry task.`,
    });
    return;
  }

  const hasField = referencedTask.steps.some((step) =>
    step.fields.some((field) => field.id === referencedFieldId),
  );

  if (!hasField) {
    details.push({
      path: `tasks.${taskId}.rules.${ruleIndex}.when.${side}`,
      message: `Variable '${operand.var}' does not reference an existing field.`,
    });
  }
}

function isBranchOperand(value: unknown): value is BranchOperand {
  return (
    typeof value === "object" &&
    value !== null &&
    "var" in value &&
    typeof (value as BranchOperand).var === "string"
  );
}
