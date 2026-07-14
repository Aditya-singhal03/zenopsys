# Zenopsys Workflow Engine

A configurable workflow engine for the Zenopsys assignment.

It supports:

- reusable workflow definitions
- workflow runs created from definition snapshots
- human data-entry tasks with save/finish modes
- automatic branch tasks
- terminal tasks
- run inspection and cancellation

## Stack

- Node.js
- TypeScript
- Express
- SQLite via `better-sqlite3`

## Run

Install dependencies:

```sh
npm install
```

Start the service:

```sh
npm run dev
```

The service listens on:

```text
http://localhost:3000
```

Use a custom port:

```sh
PORT=4000 npm run dev
```

Use a custom SQLite file:

```sh
DB_FILE=data/workflow.db npm run dev
```

## Verify

Run tests:

```sh
npm test
```

Run the worked example script:

```sh
npm run example
```

## API

Base path:

```text
/api/v1
```

### Create Workflow Definition

```http
POST /api/v1/workflow-definitions
```

Example:

```sh
curl -s http://localhost:3000/api/v1/workflow-definitions \
  -H 'content-type: application/json' \
  -d @examples/purchase-approval-definition.json
```

### Get Workflow Definition

```http
GET /api/v1/workflow-definitions/:definitionId
```

### Update Workflow Definition

```http
PUT /api/v1/workflow-definitions/:definitionId
```

The request body is a full replacement definition using the same shape as create.

Existing runs are not affected because each run stores a full definition snapshot at start time.

### Start Workflow Run

```http
POST /api/v1/workflow-definitions/:definitionId/runs
```

### Get Workflow Run

```http
GET /api/v1/runs/:runId
```

### Submit Data

```http
POST /api/v1/runs/:runId/submit
```

Save progress:

```json
{
  "mode": "save",
  "data": {
    "amount": 300
  }
}
```

Finish current step:

```json
{
  "mode": "finish",
  "data": {
    "amount": 300,
    "description": "Keyboard purchase"
  }
}
```

### Cancel Run

```http
POST /api/v1/runs/:runId/cancel
```

## Branch Logic

Branch tasks evaluate rules against data collected earlier in the run.

Rule shape:

```json
{
  "when": {
    "left": { "var": "enter_request.amount" },
    "operator": "gt",
    "right": 500
  },
  "nextTaskId": "manager_review"
}
```

Variable references use:

```text
<taskId>.<fieldId>
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

Rules are evaluated in order. The first match wins. If no rule matches, `fallbackTaskId` is used.

Branch completion events include evaluation details:

```json
{
  "taskId": "route_by_amount",
  "type": "branch",
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

## Worked Example

The example definition is:

```text
examples/purchase-approval-definition.json
```

It contains:

```text
enter_request -> route_by_amount
```

Branch logic:

```text
if enter_request.amount > 500
  go to manager_review
else
  go to auto_approve
```

### Create The Definition

```sh
DEFINITION_ID=$(
  curl -s http://localhost:3000/api/v1/workflow-definitions \
    -H 'content-type: application/json' \
    -d @examples/purchase-approval-definition.json \
  | node -pe 'JSON.parse(fs.readFileSync(0, "utf8")).id'
)
```

### Low Amount Path

Start a run:

```sh
LOW_RUN_ID=$(
  curl -s -X POST "http://localhost:3000/api/v1/workflow-definitions/$DEFINITION_ID/runs" \
  | node -pe 'JSON.parse(fs.readFileSync(0, "utf8")).id'
)
```

Submit amount `300`:

```sh
curl -s -X POST "http://localhost:3000/api/v1/runs/$LOW_RUN_ID/submit" \
  -H 'content-type: application/json' \
  -d '{
    "mode": "finish",
    "data": {
      "amount": 300,
      "description": "Keyboard purchase"
    }
  }'
```

Expected path:

```text
enter_request -> route_by_amount -> auto_approve
```

Expected status:

```text
completed
```

### High Amount Path

Start another run:

```sh
HIGH_RUN_ID=$(
  curl -s -X POST "http://localhost:3000/api/v1/workflow-definitions/$DEFINITION_ID/runs" \
  | node -pe 'JSON.parse(fs.readFileSync(0, "utf8")).id'
)
```

Submit amount `900`:

```sh
curl -s -X POST "http://localhost:3000/api/v1/runs/$HIGH_RUN_ID/submit" \
  -H 'content-type: application/json' \
  -d '{
    "mode": "finish",
    "data": {
      "amount": 900,
      "description": "Laptop purchase"
    }
  }'
```

Expected active task:

```text
manager_review
```

Finish manager review:

```sh
curl -s -X POST "http://localhost:3000/api/v1/runs/$HIGH_RUN_ID/submit" \
  -H 'content-type: application/json' \
  -d '{
    "mode": "finish",
    "data": {
      "manager_note": "Approved for onboarding."
    }
  }'
```

Expected path:

```text
enter_request -> route_by_amount -> manager_review -> approved_after_review
```

Expected status:

```text
completed
```

## Design Notes

Definitions are editable. Runs are isolated from later edits by copying the full workflow definition JSON into `workflow_runs.definition_snapshot_json` when the run starts.

`revision` is stored internally and incremented on run mutations. It is not exposed in API responses, but it provides a path to optimistic locking if safe concurrent submissions are added later.

See:

- [docs/API_CONTRACT.md](docs/API_CONTRACT.md)
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md)
- [docs/DESIGN.md](docs/DESIGN.md)

