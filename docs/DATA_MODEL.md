# Data Model

This document describes the planned persistence model for the workflow engine.

Target stack:

- Node.js
- TypeScript
- Express or Fastify
- SQLite

The model favors a small relational core plus JSON columns for definition/task payloads. This keeps the implementation compact while still making run lifecycle, status, and task progress explicit.

## Design Goals

- Store reusable workflow definitions.
- Start many runs from the same definition.
- Keep each run isolated from later definition edits.
- Track active task, current data-entry step, completed tasks, and collected data.
- Let the engine resume decisions from persisted state.
- Keep the model simple enough for the assignment while leaving room for stricter normalization later.

## Entity Overview

```text
workflow_definitions
  stores the latest editable workflow definition

workflow_runs
  stores one execution instance
  includes a full definition snapshot captured at run start

run_task_events
  stores completed task history for inspection/debuggability
```

## Tables

### `workflow_definitions`

Stores the latest version of each reusable workflow definition.

```sql
CREATE TABLE workflow_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_task_id TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Columns

- `id`
Server-generated workflow definition ID.
- `name`
Human-readable workflow name.
- `description`start_task_id
Optional human-readable description.
- `start_task_id`
The first task ID in the workflow graph.
- `definition_json`
Full JSON definition payload, including `startTaskId` and `tasks`.
- `created_at`
ISO-8601 timestamp.
- `updated_at`
ISO-8601 timestamp.

### Example `definition_json`

```json
{
  "name": "Purchase Approval",
  "description": "Routes purchase requests based on amount.",
  "startTaskId": "enter_request",
  "tasks": [
    {
      "id": "enter_request",
      "type": "data_entry",
      "name": "Enter purchase request",
      "nextTaskId": "route_by_amount",
      "steps": [
        {
          "id": "request_details",
          "name": "Request details",
          "fields": [
            {
              "id": "amount",
              "label": "Amount",
              "type": "number",
              "required": true
            }
          ]
        }
      ]
    },
    {
      "id": "route_by_amount",
      "type": "branch",
      "name": "Route by amount",
      "rules": [
        {
          "when": {
            "left": { "var": "enter_request.amount" },
            "operator": "gt",
            "right": 500
          },
          "nextTaskId": "manager_review"
        }
      ],
      "fallbackTaskId": "auto_approve"
    }
  ]
}
```

### `workflow_runs`

Stores one workflow execution instance.

```sql
CREATE TABLE workflow_runs (
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
```

### Columns

- `id`
Server-generated workflow run ID.
- `definition_id`
ID of the workflow definition the run was started from.
- `status`
Run lifecycle status:
  ```text
  in_progress | completed | canceled
  ```
- `definition_snapshot_json`
Full workflow definition JSON copied from `workflow_definitions.definition_json` when the run starts.
  This is how existing runs stay unaffected by future workflow definition edits.
- `current_task_id`
Current active task ID while the run is in progress.
  For completed or canceled runs, this is `NULL`.
- `current_step_index`
Current zero-based step index for an active data-entry task.
  For branch and terminal tasks, the engine advances immediately, so these should not remain as externally active states. For completed or canceled runs, this is `NULL`.
- `data_json`
Run data grouped by task ID.
  Finished steps are always stored here. Saved-but-unfinished step values may also be mirrored here for easier run inspection, but branch tasks only evaluate after a data-entry task is completed.
  Shape:
  ```json
  {
    "enter_request": {
      "amount": 300,
      "description": "Keyboard purchase"
    },
    "manager_review": {
      "manager_note": "Approved"
    }
  }
  ```
- `step_draft_json`
Draft data for the currently active data-entry task and step.
  Shape:
  ```json
  {
    "taskId": "enter_request",
    "stepIndex": 0,
    "data": {
      "amount": 300
    }
  }
  ```
  This supports `mode: "save"` without pretending the task is complete.
- `revision`
Monotonically increasing integer updated on every run mutation.
  This can support the optional stretch for safe concurrent submissions. Even if we do not fully implement the stretch, it is cheap to include now and useful for consistency.
- `created_at`
ISO-8601 timestamp.
- `updated_at`
ISO-8601 timestamp.
- `completed_at`
Timestamp set when the run reaches a terminal task.
- `canceled_at`
Timestamp set when the run is canceled.

### Indexes

```sql
CREATE INDEX idx_workflow_runs_definition_id ON workflow_runs(definition_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
```

### `run_task_events`

Stores task completion history for a run.

This table powers `doneTasks` in the API response and makes branch decisions inspectable.

```sql
CREATE TABLE run_task_events (
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
```

### Columns

- `id`
Server-generated event ID.
- `run_id`
Owning workflow run.
- `task_id`
Completed task ID.
- `task_type`
Completed task type.
- `sequence`
Zero-based completion order within the run.
- `event_json`
Extra event details.
- `created_at`
ISO-8601 timestamp when the task completed.

### Example Events

Data-entry task:

```json
{
  "taskId": "enter_request",
  "type": "data_entry",
  "completedAt": "2026-07-14T13:36:00.000Z"
}
```

Branch task:

```json
{
  "taskId": "route_by_amount",
  "type": "branch",
  "completedAt": "2026-07-14T13:36:00.000Z",
  "selectedTaskId": "manager_review",
  "matchedRuleIndex": 0,
  "evaluations": [
    {
      "ruleIndex": 0,
      "left": "enter_request.amount",
      "leftValue": 900,
      "operator": "gt",
      "rightValue": 500,
      "matched": true
    }
  ]
}
```

Terminal task:

```json
{
  "taskId": "approved_after_review",
  "type": "terminal",
  "completedAt": "2026-07-14T13:37:00.000Z"
}
```

### Indexes

```sql
CREATE INDEX idx_run_task_events_run_sequence ON run_task_events(run_id, sequence);
```

## Why Not Fully Normalize Tasks And Fields?

For this assignment, workflow definitions are mostly read and executed as a graph. We do not need to query all workflows containing a specific field or task type.

Keeping definition payloads as JSON has practical benefits:

- The API shape maps directly to storage.
- Definition validation can happen in application code.
- Snapshotting a definition at run start is a simple JSON copy.
- The schema remains stable if task payloads evolve.

If this became a larger product, we could add normalized tables for `workflow_tasks`, `task_steps`, and `task_fields`, or create generated/indexed JSON columns for common queries.

## Runtime State Shape

The API response for a run is assembled from:

```text
workflow_runs
  status
  definition_snapshot_json
  current_task_id
  current_step_index
  data_json
  step_draft_json

run_task_events
  doneTasks
```

### Active Task Resolution

When returning a run:

1. If status is `completed` or `canceled`, return `activeTask: null`.
2. Otherwise, find `current_task_id` in `definition_snapshot_json.tasks`.
3. If the active task is a data-entry task:
  - use `current_step_index` to select the current step
  - expose that step as `activeTask.currentStep`
  - expose matching draft data from `step_draft_json`

Branch and terminal tasks should not appear as externally active tasks because the engine advances through them automatically.

## State Transitions

### Start Run

1. Load workflow definition.
2. Copy `definition_json` into `definition_snapshot_json`.
3. Insert `workflow_runs` row:
  - `status = 'in_progress'`
  - `current_task_id = startTaskId`
  - `current_step_index = NULL`
  - `data_json = {}`
  - `step_draft_json = {}`
4. Run engine advancement.
5. Persist resulting active task or completed status.

If the start task is a branch or terminal task, the engine advances immediately.

### Save Data

For `mode: "save"`:

1. Load run.
2. Ensure status is `in_progress`.
3. Ensure current task is `data_entry`.
4. Validate submitted fields exist in the current step.
5. Validate submitted field types.
6. Merge submitted fields into `step_draft_json`.
7. Also merge into `data_json[currentTaskId]` so run inspection can show saved progress in a single data object.
8. Increment `revision`.
9. Persist run.

This does not create a `run_task_events` row.

### Finish Step

For `mode: "finish"`:

1. Load run.
2. Ensure status is `in_progress`.
3. Ensure current task is `data_entry`.
4. Merge request data with existing draft data for the current step.
5. Validate required fields for the current step.
6. Validate submitted field types.
7. Persist completed step data into `data_json[currentTaskId]`.
8. Clear `step_draft_json`.
9. If another step exists:
  - increment `current_step_index`
  - keep `current_task_id`
  - increment `revision`
  - return the updated run
10. If this was the final step:
  - append a data-entry completion event
  - set `current_task_id = nextTaskId`
  - set `current_step_index = NULL`
  - run engine advancement
  - increment `revision`
  - persist run and events

### Engine Advancement

Engine advancement runs after:

- run start
- data-entry task completion

Pseudo-flow:

```text
while status is in_progress:
  task = taskMap[current_task_id]

  if task.type == "data_entry":
    if current_step_index is null:
      current_step_index = 0
    stop

  if task.type == "branch":
    selectedTaskId = evaluateBranch(task, data_json)
    append branch event
    current_task_id = selectedTaskId
    current_step_index = null
    continue

  if task.type == "terminal":
    append terminal event
    status = "completed"
    current_task_id = null
    current_step_index = null
    completed_at = now
    stop
```

The engine should also protect against invalid graphs or infinite loops by enforcing a maximum advancement count per call, for example `100` transitions.

### Cancel Run

1. Load run.
2. Ensure status is `in_progress`.
3. Set:
  - `status = 'canceled'`
  - `current_task_id = NULL`
  - `current_step_index = NULL`
  - `canceled_at = now`
  - `updated_at = now`
4. Increment `revision`.
5. Persist run.

Canceling a run does not delete `data_json` or task events.

## Branch Data Access

Branch expressions use variable references in this format:

```text
<taskId>.<fieldId>
```

They resolve against `workflow_runs.data_json`.

Example:

```text
enter_request.amount
```

Resolves to:

```json
{
  "enter_request": {
    "amount": 900
  }
}
```

If a variable is missing, the condition is treated as not matched. If no rules match, the branch uses `fallbackTaskId`.

## Transactions

Run mutations should happen inside a database transaction:

- submit data
- engine advancement
- cancel run

This keeps `workflow_runs` and `run_task_events` consistent.

For this assignment, a transaction around each mutation is enough. If we choose the concurrency stretch, we can add optimistic locking with `revision`:

```sql
UPDATE workflow_runs
SET ...
WHERE id = ? AND revision = ?;
```

If zero rows are updated, return `409 Conflict`.

## TypeScript Domain Types

These are the application-level types the JSON columns map to.

```ts
type WorkflowDefinition = {
  id: string;
  name: string;
  description?: string;
  startTaskId: string;
  tasks: TaskDefinition[];
  createdAt: string;
  updatedAt: string;
};

type TaskDefinition = DataEntryTask | BranchTask | TerminalTask;

type DataEntryTask = {
  id: string;
  type: "data_entry";
  name: string;
  nextTaskId: string;
  steps: DataEntryStep[];
};

type DataEntryStep = {
  id: string;
  name: string;
  fields: FieldDefinition[];
};

type FieldDefinition =
  | TextField
  | NumberField
  | SingleSelectField
  | MultiSelectField;

type TextField = {
  id: string;
  label: string;
  type: "text";
  required?: boolean;
};

type NumberField = {
  id: string;
  label: string;
  type: "number";
  required?: boolean;
};

type SingleSelectField = {
  id: string;
  label: string;
  type: "single_select";
  required?: boolean;
  options: SelectOption[];
};

type MultiSelectField = {
  id: string;
  label: string;
  type: "multi_select";
  required?: boolean;
  options: SelectOption[];
};

type SelectOption = {
  label: string;
  value: string;
};

type BranchTask = {
  id: string;
  type: "branch";
  name: string;
  rules: BranchRule[];
  fallbackTaskId: string;
};

type BranchRule = {
  when: BranchCondition;
  nextTaskId: string;
};

type BranchCondition = {
  left: BranchOperand;
  operator: BranchOperator;
  right: BranchOperand | string | number | boolean | string[] | number[];
};

type BranchOperand = {
  var: string;
};

type BranchOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "in";

type TerminalTask = {
  id: string;
  type: "terminal";
  name: string;
};

type WorkflowRun = {
  id: string;
  definitionId: string;
  status: "in_progress" | "completed" | "canceled";
  definitionSnapshot: WorkflowDefinition;
  currentTaskId: string | null;
  currentStepIndex: number | null;
  data: RunData;
  stepDraft: StepDraft | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
};

type RunData = Record<string, Record<string, unknown>>;

type StepDraft = {
  taskId: string;
  stepIndex: number;
  data: Record<string, unknown>;
};

type RunTaskEvent = {
  id: string;
  runId: string;
  taskId: string;
  taskType: "data_entry" | "branch" | "terminal";
  sequence: number;
  event: Record<string, unknown>;
  createdAt: string;
};
```

## Final Decisions

These decisions are finalized for implementation:

1. `mode: "save"` writes partial values to both `step_draft_json` and `data_json`.
   - `step_draft_json` remains the source of truth for the active unfinished step.
   - `data_json` mirrors saved progress so run inspection has a single collected-data object.
   - Branching still only happens after a data-entry task is completed.

2. `revision` is stored internally but is not exposed in API responses for now.
   - It remains available for optimistic locking if we implement the concurrency stretch later.

3. Branch task completion events include evaluation details.
   - Store `selectedTaskId`, `matchedRuleIndex`, and an `evaluations` array containing the evaluated left/right values for each checked rule.

4. Workflow definition updates use full replacement `PUT`.
   - This avoids partial graph edit complexity.
   - Existing runs remain unaffected because they execute against their stored definition snapshot.
