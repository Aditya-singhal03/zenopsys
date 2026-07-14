import type { Db } from "../db/connection.js";
import { createId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import type {
  WorkflowDefinition,
  WorkflowDefinitionInput,
} from "../shared/types.js";
import { notFound } from "../shared/errors.js";
import { WorkflowDefinitionRepository } from "./repository.js";

export class WorkflowDefinitionService {
  private readonly repository: WorkflowDefinitionRepository;

  constructor(db: Db) {
    this.repository = new WorkflowDefinitionRepository(db);
  }

  create(input: WorkflowDefinitionInput): WorkflowDefinition {
    const timestamp = nowIso();
    const definition: WorkflowDefinition = {
      ...input,
      id: createId("wfd"),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return this.repository.create(definition);
  }

  get(id: string): WorkflowDefinition {
    const definition = this.repository.findById(id);

    if (!definition) {
      throw notFound(`Workflow definition '${id}' was not found.`);
    }

    return definition;
  }

  update(id: string, input: WorkflowDefinitionInput): WorkflowDefinition {
    const existing = this.repository.findById(id);

    if (!existing) {
      throw notFound(`Workflow definition '${id}' was not found.`);
    }

    const updated: WorkflowDefinition = {
      ...input,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    };

    return this.repository.update(updated);
  }
}
