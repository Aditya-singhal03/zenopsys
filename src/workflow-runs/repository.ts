import type { Db } from "../db/connection.js";
import { parseJson, stringifyJson } from "../db/json.js";
import type {
  RunData,
  RunTaskEvent,
  StepDraft,
  WorkflowDefinition,
  WorkflowRunRecord,
} from "../shared/types.js";

type RunRow = {
  id: string;
  definition_id: string;
  status: WorkflowRunRecord["status"];
  definition_snapshot_json: string;
  current_task_id: string | null;
  current_step_index: number | null;
  data_json: string;
  step_draft_json: string;
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  canceled_at: string | null;
};

type EventRow = {
  id: string;
  run_id: string;
  task_id: string;
  task_type: RunTaskEvent["taskType"];
  sequence: number;
  event_json: string;
  created_at: string;
};

export class WorkflowRunRepository {
  constructor(private readonly db: Db) {}

  create(run: WorkflowRunRecord): WorkflowRunRecord {
    this.db
      .prepare(
        `
          INSERT INTO workflow_runs (
            id,
            definition_id,
            status,
            definition_snapshot_json,
            current_task_id,
            current_step_index,
            data_json,
            step_draft_json,
            revision,
            created_at,
            updated_at,
            completed_at,
            canceled_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        run.id,
        run.definitionId,
        run.status,
        stringifyJson(run.definitionSnapshot),
        run.currentTaskId,
        run.currentStepIndex,
        stringifyJson(run.data),
        stringifyJson(run.stepDraft),
        run.revision,
        run.createdAt,
        run.updatedAt,
        run.completedAt,
        run.canceledAt,
      );

    return run;
  }

  findById(id: string): WorkflowRunRecord | null {
    const row = this.db
      .prepare("SELECT * FROM workflow_runs WHERE id = ?")
      .get(id) as RunRow | undefined;

    if (!row) {
      return null;
    }

    return this.fromRunRow(row);
  }

  update(run: WorkflowRunRecord): WorkflowRunRecord {
    this.db
      .prepare(
        `
          UPDATE workflow_runs
          SET
            status = ?,
            definition_snapshot_json = ?,
            current_task_id = ?,
            current_step_index = ?,
            data_json = ?,
            step_draft_json = ?,
            revision = ?,
            updated_at = ?,
            completed_at = ?,
            canceled_at = ?
          WHERE id = ?
        `,
      )
      .run(
        run.status,
        stringifyJson(run.definitionSnapshot),
        run.currentTaskId,
        run.currentStepIndex,
        stringifyJson(run.data),
        stringifyJson(run.stepDraft),
        run.revision,
        run.updatedAt,
        run.completedAt,
        run.canceledAt,
        run.id,
      );

    return run;
  }

  listEvents(runId: string): RunTaskEvent[] {
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM run_task_events
          WHERE run_id = ?
          ORDER BY sequence ASC
        `,
      )
      .all(runId) as EventRow[];

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      taskId: row.task_id,
      taskType: row.task_type,
      sequence: row.sequence,
      event: parseJson<Record<string, unknown>>(row.event_json),
      createdAt: row.created_at,
    }));
  }

  appendEvent(event: RunTaskEvent): RunTaskEvent {
    this.db
      .prepare(
        `
          INSERT INTO run_task_events (
            id,
            run_id,
            task_id,
            task_type,
            sequence,
            event_json,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        event.id,
        event.runId,
        event.taskId,
        event.taskType,
        event.sequence,
        stringifyJson(event.event),
        event.createdAt,
      );

    return event;
  }

  nextEventSequence(runId: string): number {
    const row = this.db
      .prepare(
        `
          SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
          FROM run_task_events
          WHERE run_id = ?
        `,
      )
      .get(runId) as { next_sequence: number };

    return row.next_sequence;
  }

  private fromRunRow(row: RunRow): WorkflowRunRecord {
    return {
      id: row.id,
      definitionId: row.definition_id,
      status: row.status,
      definitionSnapshot: parseJson<WorkflowDefinition>(
        row.definition_snapshot_json,
      ),
      currentTaskId: row.current_task_id,
      currentStepIndex: row.current_step_index,
      data: parseJson<RunData>(row.data_json),
      stepDraft: parseJson<StepDraft | null>(row.step_draft_json),
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      canceledAt: row.canceled_at,
    };
  }
}
