# Workflow Engine Design

This document is the implementation blueprint for the Zenopsys assignment.

Related docs:

- [API_CONTRACT.md](./API_CONTRACT.md)
- [DATA_MODEL.md](./DATA_MODEL.md)

## Goal

Build a backend service that lets a user:

1. Create a reusable workflow definition.
2. Start many workflow runs from that definition.
3. Submit human task data step by step.
4. Let the engine automatically resolve branch tasks.
5. Complete or cancel runs.
6. Demonstrate the same workflow taking different paths based on submitted data.

Out of scope:

- auth
- notifications
- file uploads
- audit trails
- parallel branches
- deadlines/timeouts
- extra task kinds

## Stack

- Runtime: Node.js
- Language: TypeScript
- HTTP framework: Express or Fastify
- Database: SQLite
- API format: JSON REST

The implementation should stay small and readable. The assignment is about the workflow engine, not infrastructure complexity.

## High-Level Architecture

```text
HTTP API
  -> request validation
  -> application services
  -> workflow engine
  -> SQLite repositories
```

Suggested modules:

```text
src/
  server.ts
  app.ts
  db/
    connection.ts
    schema.ts
  workflow-definitions/
    routes.ts
    service.ts
    validation.ts
  workflow-runs/
    routes.ts
    service.ts
    presenter.ts
  engine/
    advanceRun.ts
    evaluateBranch.ts
    validateSubmission.ts
  shared/
    ids.ts
    errors.ts
    time.ts
    types.ts
```

## Domain Model

### Workflow Definition

A workflow definition is an editable template.

It contains:

- `id`
- `name`
- `description`
- `startTaskId`
- `tasks`
- timestamps

Task IDs are authored by the caller and must be unique inside a definition.

### Workflow Run

A workflow run is one execution instance.

It contains:

- `definitionId`
- `definitionSnapshot`
- `status`
- `currentTaskId`
- `currentStepIndex`
- `data`
- `stepDraft`
- `doneTasks`
- timestamps

The important rule: a run always executes against `definitionSnapshot`, not the mutable workflow definition row.

## Task Types

### `data_entry`

A human-completed task.

Properties:

- `id`
- `type: "data_entry"`
- `name`
- `nextTaskId`
- `steps`

Each step contains fields. Supported field types:

- `text`
- `number`
- `single_select`
- `multi_select`

A data-entry task is complete only after the final step is finished.

### `branch`

An engine-completed task.

Properties:

- `id`
- `type: "branch"`
- `name`
- `rules`
- `fallbackTaskId`

Rules are evaluated in order. The first matching rule wins. If none match, the engine uses `fallbackTaskId`.

### `terminal`

An engine-completed task that ends the run.

Properties:

- `id`
- `type: "terminal"`
- `name`

## Persistence

Use three tables:

```text
workflow_definitions
workflow_runs
run_task_events
```

### `workflow_definitions`

Stores the latest workflow definition. The full definition payload is stored as JSON.

### `workflow_runs`

Stores the current state of a run.

Important columns:

- `definition_snapshot_json`
- `current_task_id`
- `current_step_index`
- `data_json`
- `step_draft_json`
- `revision`
- `status`

### `run_task_events`

Stores completed task history in sequence order.

This powers the API response field:

```json
{
  "doneTasks": []
}
```

Branch events also include evaluation details for debuggability.

## Definition Lifecycle

### Create Definition

Request:

```http
POST /api/v1/workflow-definitions
```

Flow:

1. Validate request body shape.
2. Validate graph consistency:
   - `startTaskId` exists
   - task IDs are unique
   - all `nextTaskId` references exist
   - all branch fallback targets exist
   - data-entry tasks have at least one step
   - steps have at least one field
3. Store the full definition JSON.
4. Return stored definition.

### Update Definition

Request:

```http
PUT /api/v1/workflow-definitions/:definitionId
```

Flow:

1. Validate the replacement definition.
2. Replace the stored definition JSON.
3. Update `updated_at`.
4. Return updated definition.

Existing runs are not affected.

## Run Lifecycle

### Start Run

Request:

```http
POST /api/v1/workflow-definitions/:definitionId/runs
```

Flow:

1. Load the workflow definition.
2. Copy its JSON into `definition_snapshot_json`.
3. Create a run with:
   - `status = "in_progress"`
   - `currentTaskId = startTaskId`
   - `currentStepIndex = null`
   - `data = {}`
   - `stepDraft = {}`
4. Call `advanceRun`.
5. Return the presented run.

Why call `advanceRun` immediately:

- The start task might be a branch.
- The start task might be terminal.
- The API should return the first human-actionable task, not an internal engine-only task.

### Inspect Run

Request:

```http
GET /api/v1/runs/:runId
```

Flow:

1. Load run.
2. Load task events ordered by sequence.
3. Build `activeTask` from the run snapshot and current state.
4. Return:
   - status
   - active task
   - done tasks
   - collected data

For completed or canceled runs, `activeTask` is `null`.

### Save Progress

Request:

```http
POST /api/v1/runs/:runId/submit
```

Body:

```json
{
  "mode": "save",
  "data": {
    "amount": 300
  }
}
```

Flow:

1. Load run in a transaction.
2. Ensure run is `in_progress`.
3. Ensure current task is `data_entry`.
4. Validate submitted field IDs belong to the current step.
5. Validate field types for provided values.
6. Merge values into `step_draft_json`.
7. Mirror values into `data_json[currentTaskId]`.
8. Increment internal `revision`.
9. Commit and return run.

Save mode does not:

- require all required fields
- advance the step
- complete the task
- create a task event

### Finish Step

Request:

```http
POST /api/v1/runs/:runId/submit
```

Body:

```json
{
  "mode": "finish",
  "data": {
    "amount": 300,
    "description": "Keyboard purchase"
  }
}
```

Flow:

1. Load run in a transaction.
2. Ensure run is `in_progress`.
3. Ensure current task is `data_entry`.
4. Merge submitted data with any existing draft for this step.
5. Validate required fields.
6. Validate field types and select options.
7. Store values in `data_json[currentTaskId]`.
8. Clear `step_draft_json`.
9. If another step remains:
   - increment `currentStepIndex`
   - return run
10. If this was the final step:
   - append a data-entry completion event
   - set `currentTaskId = nextTaskId`
   - set `currentStepIndex = null`
   - call `advanceRun`
   - return run

### Cancel Run

Request:

```http
POST /api/v1/runs/:runId/cancel
```

Flow:

1. Load run in a transaction.
2. Ensure run is `in_progress`.
3. Set:
   - `status = "canceled"`
   - `currentTaskId = null`
   - `currentStepIndex = null`
   - `canceledAt = now`
4. Keep already collected data and events.
5. Return run.

## Engine Advancement

`advanceRun` is responsible for moving a run through engine-only tasks.

It runs after:

- starting a run
- completing a data-entry task

Pseudo-code:

```ts
function advanceRun(run) {
  let transitions = 0;

  while (run.status === "in_progress") {
    if (transitions++ > 100) {
      throw new Error("Workflow exceeded maximum automatic transitions");
    }

    const task = getTaskFromSnapshot(run.currentTaskId);

    if (task.type === "data_entry") {
      if (run.currentStepIndex === null) {
        run.currentStepIndex = 0;
      }
      return run;
    }

    if (task.type === "branch") {
      const result = evaluateBranch(task, run.data);
      appendBranchEvent(task, result);
      run.currentTaskId = result.selectedTaskId;
      run.currentStepIndex = null;
      continue;
    }

    if (task.type === "terminal") {
      appendTerminalEvent(task);
      run.status = "completed";
      run.currentTaskId = null;
      run.currentStepIndex = null;
      run.completedAt = now();
      return run;
    }
  }
}
```

The max transition guard protects against bad graphs such as branch loops.

## Branch Evaluation

Branch condition format:

```json
{
  "left": { "var": "enter_request.amount" },
  "operator": "gt",
  "right": 500
}
```

Variable format:

```text
<taskId>.<fieldId>
```

Data lookup:

```json
{
  "enter_request": {
    "amount": 900
  }
}
```

Supported operators:

- `eq`
- `neq`
- `gt`
- `gte`
- `lt`
- `lte`
- `contains`
- `in`

Rules:

- Missing variable means the condition does not match.
- Rules are evaluated in array order.
- First match wins.
- If no rule matches, use `fallbackTaskId`.

Branch event shape:

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

## Validation

### Definition Validation

Validate on create and update.

Checks:

- workflow has `name`
- workflow has `startTaskId`
- workflow has at least one task
- task IDs are unique
- `startTaskId` exists
- data-entry `nextTaskId` exists
- branch rule `nextTaskId` values exist
- branch `fallbackTaskId` exists
- terminal tasks do not define next task
- data-entry steps and fields are non-empty
- select fields have valid options

### Submission Validation

Validate on save and finish.

Checks:

- run exists
- run is `in_progress`
- active task is `data_entry`
- submitted fields exist on current step
- submitted values match field types
- select values are allowed
- required fields are present on `finish`

## API Response Presentation

Database rows should not be returned directly.

Use a presenter to map internal snake_case and JSON columns to API shape:

```text
workflow_runs row
  -> parse definition_snapshot_json
  -> parse data_json
  -> parse step_draft_json
  -> attach ordered run_task_events
  -> derive activeTask
```

`revision` stays internal and is not included in API responses for now.

## Consistency

All run mutations happen in a transaction:

- start run
- submit save
- submit finish
- engine advancement
- cancel run

This keeps the run row and task events consistent.

`revision` is stored internally and incremented on mutation. We are not exposing it yet, but it gives us a clean path to implement safe concurrent submissions later with optimistic locking.

## Worked Example

Definition path:

```text
enter_request -> route_by_amount
```

Branch:

```text
if enter_request.amount > 500
  go to manager_review
else
  go to auto_approve
```

Low amount run:

```text
start
submit amount = 300
enter_request completes
route_by_amount evaluates false
auto_approve terminal completes
run status = completed
```

Path:

```text
enter_request -> route_by_amount -> auto_approve
```

High amount run:

```text
start
submit amount = 900
enter_request completes
route_by_amount evaluates true
manager_review becomes active
submit manager note
manager_review completes
approved_after_review terminal completes
run status = completed
```

Path:

```text
enter_request -> route_by_amount -> manager_review -> approved_after_review
```

## Implementation Order

After this design is approved, implement in this order:

1. Initialize TypeScript service and SQLite setup.
2. Add database schema and repositories.
3. Add domain types and validation.
4. Implement workflow definition create/get/update.
5. Implement run start/get/cancel.
6. Implement submit save/finish.
7. Implement `advanceRun`.
8. Implement branch evaluation.
9. Add worked example JSON and README curl sequence.
10. Add tests for:
    - definition validation
    - low branch path
    - high branch path
    - multi-step data-entry behavior
    - cancel behavior

## Finalized Decisions

- `save` writes to both `step_draft_json` and `data_json`.
- `revision` is stored internally but not exposed in API responses.
- Branch task events include evaluated values.
- Workflow definition updates are full replacement `PUT`.
- Runs execute against definition snapshots captured at start.
