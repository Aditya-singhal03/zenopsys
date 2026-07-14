import { validationError } from "../shared/errors.js";
import type {
  DataEntryStep,
  FieldDefinition,
  SubmitMode,
} from "../shared/types.js";

export function validateSubmissionData(
  step: DataEntryStep,
  mode: SubmitMode,
  data: Record<string, unknown>,
): void {
  const details: { path: string; message: string }[] = [];
  const fields = new Map(step.fields.map((field) => [field.id, field]));

  for (const [fieldId, value] of Object.entries(data)) {
    const field = fields.get(fieldId);

    if (!field) {
      details.push({
        path: `data.${fieldId}`,
        message: `Field '${fieldId}' is not part of the current step.`,
      });
      continue;
    }

    validateFieldValue(field, value, details);
  }

  if (mode === "finish") {
    for (const field of step.fields) {
      if (!field.required) {
        continue;
      }

      if (isMissing(data[field.id])) {
        details.push({
          path: `data.${field.id}`,
          message: `Field '${field.id}' is required.`,
        });
      }
    }
  }

  if (details.length > 0) {
    throw validationError("Submission data is invalid.", details);
  }
}

function validateFieldValue(
  field: FieldDefinition,
  value: unknown,
  details: { path: string; message: string }[],
): void {
  if (isMissing(value)) {
    return;
  }

  switch (field.type) {
    case "text":
      if (typeof value !== "string") {
        details.push({
          path: `data.${field.id}`,
          message: "Expected text value.",
        });
      }
      return;

    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        details.push({
          path: `data.${field.id}`,
          message: "Expected number value.",
        });
      }
      return;

    case "single_select":
      if (
        typeof value !== "string" ||
        !field.options.some((option) => option.value === value)
      ) {
        details.push({
          path: `data.${field.id}`,
          message: "Expected one of the configured option values.",
        });
      }
      return;

    case "multi_select":
      if (
        !Array.isArray(value) ||
        !value.every(
          (item) =>
            typeof item === "string" &&
            field.options.some((option) => option.value === item),
        )
      ) {
        details.push({
          path: `data.${field.id}`,
          message: "Expected an array of configured option values.",
        });
      }
      return;
  }
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
