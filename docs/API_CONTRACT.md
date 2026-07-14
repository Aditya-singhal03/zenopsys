# API Contract

This service exposes a JSON REST API for defining workflows and driving workflow runs to completion.

## Conventions

- Base path: `/api/v1`
- Content type: `application/json`
- IDs are server-generated strings.
- Timestamps are ISO-8601 strings.
- A workflow run executes against a snapshot of the workflow definition captured when the run starts.
- Authentication and authorization are out of scope.

## Core Concepts

### Workflow Definition

A reusable workflow template containing a directed graph of tasks.

```json
{
  "id": "wfd_purchase_approval",
  "name": "Purchase Approval",
  "description": "Routes purchase requests based on amount.",
  "startTaskId": "enter_request",
  "tasks": [
    {
      "id": "enter_request",
      "type": "data_entry",
      "name": "Enter purchase request",
      "steps": []
    }
  ],
  "createdAt": "2026-07-14T13:30:00.000Z",
  "updatedAt": "2026-07-14T13:30:00.000Z"
}
```

### Workflow Run

An execution instance of a workflow definition.

```json
{
  "id": "run_123",
  "definitionId": "wfd_purchase_approval",
  "status": "in_progress",
  "activeTask": {},
  "doneTasks": [],
  "data": {},
  "createdAt": "2026-07-14T13:35:00.000Z",
  "updatedAt": "2026-07-14T13:35:00.000Z",
  "completedAt": null,
  "canceledAt": null
}
```

Allowed run statuses:

- `in_progress`
- `completed`
- `canceled`

## Task Definitions

### Data Entry Task

A human-completed task. It contains one or more ordered steps. Each step contains one or more input fields.

```json
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
        },
        {
          "id": "description",
          "label": "Description",
          "type": "text",
          "required": true
        }
      ]
    }
  ]
}
```

Supported field types:

- `text`
- `number`
- `single_select`
- `multi_select`

Select fields define options:

```json
{
  "id": "department",
  "label": "Department",
  "type": "single_select",
  "required": true,
  "options": [
    { "label": "Engineering", "value": "engineering" },
    { "label": "Finance", "value": "finance" }
  ]
}
```

### Branch Task

An engine-resolved task. It evaluates rules against data collected earlier in the run and chooses the next task. If no rule matches, it uses `fallbackTaskId`.

```json
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
```

Branch rules are evaluated in order. The first matching rule wins.

Supported operators:

- `eq`
- `neq`
- `gt`
- `gte`
- `lt`
- `lte`
- `contains`
- `in`

Variable references use:

```text
<taskId>.<fieldId>
```

Example:

```text
enter_request.amount
```

This references the `amount` field submitted for the `enter_request` task.

### Terminal Task

A task that ends the run.

```json
{
  "id": "approved",
  "type": "terminal",
  "name": "Approved"
}
```

## Endpoints

### Create Workflow Definition

```http
POST /api/v1/workflow-definitions
```

Request:

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
            },
            {
              "id": "description",
              "label": "Description",
              "type": "text",
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
    },
    {
      "id": "manager_review",
      "type": "data_entry",
      "name": "Manager review",
      "nextTaskId": "approved_after_review",
      "steps": [
        {
          "id": "review",
          "name": "Review",
          "fields": [
            {
              "id": "manager_note",
              "label": "Manager note",
              "type": "text",
              "required": true
            }
          ]
        }
      ]
    },
    {
      "id": "auto_approve",
      "type": "terminal",
      "name": "Auto approved"
    },
    {
      "id": "approved_after_review",
      "type": "terminal",
      "name": "Approved after manager review"
    }
  ]
}
```

Response `201 Created`:

The stored workflow definition, with generated `id`, `createdAt`, and `updatedAt`.

```json
{
  "id": "wfd_01HZX",
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
            },
            {
              "id": "description",
              "label": "Description",
              "type": "text",
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
    },
    {
      "id": "manager_review",
      "type": "data_entry",
      "name": "Manager review",
      "nextTaskId": "approved_after_review",
      "steps": [
        {
          "id": "review",
          "name": "Review",
          "fields": [
            {
              "id": "manager_note",
              "label": "Manager note",
              "type": "text",
              "required": true
            }
          ]
        }
      ]
    },
    {
      "id": "auto_approve",
      "type": "terminal",
      "name": "Auto approved"
    },
    {
      "id": "approved_after_review",
      "type": "terminal",
      "name": "Approved after manager review"
    }
  ],
  "createdAt": "2026-07-14T13:30:00.000Z",
  "updatedAt": "2026-07-14T13:30:00.000Z"
}
```

Validation rules:

- `startTaskId` must refer to an existing task.
- Task IDs must be unique within the definition.
- Data-entry tasks must have at least one step.
- Data-entry steps must have at least one field.
- Data-entry `nextTaskId` must refer to an existing task.
- Branch `nextTaskId` and `fallbackTaskId` values must refer to existing tasks.
- Terminal tasks must not define a next task.

### Get Workflow Definition

```http
GET /api/v1/workflow-definitions/{definitionId}
```

Response `200 OK`:

The stored workflow definition.

```json
{
  "id": "wfd_01HZX",
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
            },
            {
              "id": "description",
              "label": "Description",
              "type": "text",
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
    },
    {
      "id": "manager_review",
      "type": "data_entry",
      "name": "Manager review",
      "nextTaskId": "approved_after_review",
      "steps": [
        {
          "id": "review",
          "name": "Review",
          "fields": [
            {
              "id": "manager_note",
              "label": "Manager note",
              "type": "text",
              "required": true
            }
          ]
        }
      ]
    },
    {
      "id": "auto_approve",
      "type": "terminal",
      "name": "Auto approved"
    },
    {
      "id": "approved_after_review",
      "type": "terminal",
      "name": "Approved after manager review"
    }
  ],
  "createdAt": "2026-07-14T13:30:00.000Z",
  "updatedAt": "2026-07-14T13:30:00.000Z"
}
```

### Update Workflow Definition

```http
PUT /api/v1/workflow-definitions/{definitionId}
```

Request body uses the same shape as `POST /api/v1/workflow-definitions`, excluding server-generated fields.

Response `200 OK`:

The updated workflow definition.

Rules:

- The replacement definition must pass the same validation rules as creation.
- Existing runs are not affected because each run stores the definition snapshot captured at run start.
- New runs use the latest saved definition.

### Start Workflow Run

```http
POST /api/v1/workflow-definitions/{definitionId}/runs
```

Response `201 Created`:

```json
{
  "id": "run_01HZR",
  "definitionId": "wfd_01HZX",
  "status": "in_progress",
  "activeTask": {
    "id": "enter_request",
    "type": "data_entry",
    "name": "Enter purchase request",
    "currentStep": {
      "id": "request_details",
      "name": "Request details",
      "index": 0,
      "fields": [
        {
          "id": "amount",
          "label": "Amount",
          "type": "number",
          "required": true
        },
        {
          "id": "description",
          "label": "Description",
          "type": "text",
          "required": true
        }
      ]
    },
    "savedData": {}
  },
  "doneTasks": [],
  "data": {},
  "createdAt": "2026-07-14T13:35:00.000Z",
  "updatedAt": "2026-07-14T13:35:00.000Z",
  "completedAt": null,
  "canceledAt": null
}
```

Starting a run stores a complete snapshot of the workflow definition on the run record. The engine uses that snapshot for all later transitions.

### Get Workflow Run

```http
GET /api/v1/runs/{runId}
```

Response `200 OK`:

```json
{
  "id": "run_01HZR",
  "definitionId": "wfd_01HZX",
  "status": "in_progress",
  "activeTask": {
    "id": "enter_request",
    "type": "data_entry",
    "name": "Enter purchase request",
    "currentStep": {
      "id": "request_details",
      "name": "Request details",
      "index": 0,
      "fields": [
        {
          "id": "amount",
          "label": "Amount",
          "type": "number",
          "required": true
        }
      ]
    },
    "savedData": {
      "amount": 300
    }
  },
  "doneTasks": [],
  "data": {
    "enter_request": {
      "amount": 300
    }
  },
  "createdAt": "2026-07-14T13:35:00.000Z",
  "updatedAt": "2026-07-14T13:36:00.000Z",
  "completedAt": null,
  "canceledAt": null
}
```

For completed or canceled runs, `activeTask` is `null`.

### Submit Data To Active Task

```http
POST /api/v1/runs/{runId}/submit
```

Request:

```json
{
  "mode": "finish",
  "data": {
    "amount": 300,
    "description": "Keyboard purchase"
  }
}
```

Allowed modes:

- `save`
- `finish`

Save mode:

- Persists partial data for the current step.
- Does not advance to the next step.
- Does not complete the task.
- Required-field validation is not enforced.
- Type validation is still enforced for fields that are present.

Finish mode:

- Persists submitted data for the current step.
- Validates required fields for the current step.
- If more steps remain, advances to the next step.
- If this is the final step, completes the data-entry task.
- After task completion, the engine automatically advances through branch tasks until it reaches the next data-entry task or a terminal task.

Response `200 OK`:

```json
{
  "id": "run_01HZR",
  "definitionId": "wfd_01HZX",
  "status": "completed",
  "activeTask": null,
  "doneTasks": [
    {
      "taskId": "enter_request",
      "type": "data_entry",
      "completedAt": "2026-07-14T13:36:00.000Z"
    },
    {
      "taskId": "route_by_amount",
      "type": "branch",
      "completedAt": "2026-07-14T13:36:00.000Z",
      "selectedTaskId": "auto_approve",
      "matchedRuleIndex": null,
      "evaluations": [
        {
          "ruleIndex": 0,
          "left": "enter_request.amount",
          "leftValue": 300,
          "operator": "gt",
          "rightValue": 500,
          "matched": false
        }
      ]
    },
    {
      "taskId": "auto_approve",
      "type": "terminal",
      "completedAt": "2026-07-14T13:36:00.000Z"
    }
  ],
  "data": {
    "enter_request": {
      "amount": 300,
      "description": "Keyboard purchase"
    }
  },
  "createdAt": "2026-07-14T13:35:00.000Z",
  "updatedAt": "2026-07-14T13:36:00.000Z",
  "completedAt": "2026-07-14T13:36:00.000Z",
  "canceledAt": null
}
```

Error cases:

- `400 Bad Request`: invalid request body or invalid field values.
- `404 Not Found`: run does not exist.
- `409 Conflict`: run is not in progress, or active task is not a data-entry task.

### Cancel Workflow Run

```http
POST /api/v1/runs/{runId}/cancel
```

Response `200 OK`:

```json
{
  "id": "run_01HZR",
  "definitionId": "wfd_01HZX",
  "status": "canceled",
  "activeTask": null,
  "doneTasks": [],
  "data": {},
  "createdAt": "2026-07-14T13:35:00.000Z",
  "updatedAt": "2026-07-14T13:37:00.000Z",
  "completedAt": null,
  "canceledAt": "2026-07-14T13:37:00.000Z"
}
```

Rules:

- Only `in_progress` runs can be canceled.
- Canceling a run prevents future submissions.

## Standard Error Shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body is invalid.",
    "details": [
      {
        "path": "tasks[0].steps[0].fields[0].type",
        "message": "Unsupported field type."
      }
    ]
  }
}
```

Common error codes:

- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `INTERNAL_ERROR`

## Worked Branching Example

The definition contains this branch:

```json
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
```

### Run A: Low Amount

1. Start run from definition.
2. Submit:

```json
{
  "mode": "finish",
  "data": {
    "amount": 300,
    "description": "Keyboard purchase"
  }
}
```

Expected path:

```text
enter_request -> route_by_amount -> auto_approve
```

Expected final status:

```text
completed
```

### Run B: High Amount

1. Start another run from the same definition.
2. Submit:

```json
{
  "mode": "finish",
  "data": {
    "amount": 900,
    "description": "Laptop purchase"
  }
}
```

Expected path:

```text
enter_request -> route_by_amount -> manager_review
```

3. Submit manager review:

```json
{
  "mode": "finish",
  "data": {
    "manager_note": "Approved for onboarding."
  }
}
```

Expected final path:

```text
enter_request -> route_by_amount -> manager_review -> approved_after_review
```

Expected final status:

```text
completed
```
