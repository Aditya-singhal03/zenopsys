import type { Db } from "../db/connection.js";
import { parseJson, stringifyJson } from "../db/json.js";
import type { WorkflowDefinition } from "../shared/types.js";

type DefinitionRow = {
  id: string;
  name: string;
  description: string | null;
  start_task_id: string;
  definition_json: string;
  created_at: string;
  updated_at: string;
};

export class WorkflowDefinitionRepository {
  constructor(private readonly db: Db) {}

  create(definition: WorkflowDefinition): WorkflowDefinition {
    this.db
      .prepare(
        `
          INSERT INTO workflow_definitions (
            id,
            name,
            description,
            start_task_id,
            definition_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        definition.id,
        definition.name,
        definition.description ?? null,
        definition.startTaskId,
        stringifyJson(definition),
        definition.createdAt,
        definition.updatedAt,
      );

    return definition;
  }

  findById(id: string): WorkflowDefinition | null {
    const row = this.db
      .prepare("SELECT * FROM workflow_definitions WHERE id = ?")
      .get(id) as DefinitionRow | undefined;

    if (!row) {
      return null;
    }

    return parseJson<WorkflowDefinition>(row.definition_json);
  }

  update(definition: WorkflowDefinition): WorkflowDefinition {
    this.db
      .prepare(
        `
          UPDATE workflow_definitions
          SET
            name = ?,
            description = ?,
            start_task_id = ?,
            definition_json = ?,
            updated_at = ?
          WHERE id = ?
        `,
      )
      .run(
        definition.name,
        definition.description ?? null,
        definition.startTaskId,
        stringifyJson(definition),
        definition.updatedAt,
        definition.id,
      );

    return definition;
  }
}
