import { z } from "zod";
import { validationError } from "../shared/errors.js";
import type { SubmitMode } from "../shared/types.js";

const submitSchema = z.object({
  mode: z.enum(["save", "finish"]),
  data: z.record(z.string(), z.unknown()),
});

export type SubmitRequest = {
  mode: SubmitMode;
  data: Record<string, unknown>;
};

export function parseSubmitRequest(body: unknown): SubmitRequest {
  const result = submitSchema.safeParse(body);

  if (!result.success) {
    throw validationError(
      "Submit request is invalid.",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
