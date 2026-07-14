import type { Db } from "./connection.js";

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      start_task_id TEXT NOT NULL,
      definition_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      definition_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'canceled')),
      definition_snapshot_json TEXT NOT NULL,
      current_task_id TEXT,
      current_step_index INTEGER,
      data_json TEXT NOT NULL,
      step_draft_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      canceled_at TEXT,
      FOREIGN KEY (definition_id) REFERENCES workflow_definitions(id)
    );

    CREATE TABLE IF NOT EXISTS run_task_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_type TEXT NOT NULL CHECK (task_type IN ('data_entry', 'branch', 'terminal')),
      sequence INTEGER NOT NULL,
      event_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES workflow_runs(id),
      UNIQUE (run_id, sequence)
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_runs_definition_id
      ON workflow_runs(definition_id);

    CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
      ON workflow_runs(status);

    CREATE INDEX IF NOT EXISTS idx_run_task_events_run_sequence
      ON run_task_events(run_id, sequence);
  `);
}
