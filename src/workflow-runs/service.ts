import type { Db } from "../db/connection.js";
import { advanceRun, createTaskEvent, type EventAppender } from "../engine/advanceRun.js";
import { getTaskOrThrow } from "../engine/taskLookup.js";
import { validateSubmissionData } from "../engine/validateSubmission.js";
import { conflict, notFound, validationError } from "../shared/errors.js";
import { createId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import type {
  DataEntryTask,
  RunTaskEvent,
  StepDraft,
  SubmitMode,
  WorkflowRunRecord,
  WorkflowRunResponse,
} from "../shared/types.js";
import { WorkflowDefinitionRepository } from "../workflow-definitions/repository.js";
import { presentRun } from "./presenter.js";
import { WorkflowRunRepository } from "./repository.js";

export class WorkflowRunService {
  private readonly definitionRepository: WorkflowDefinitionRepository;
  private readonly runRepository: WorkflowRunRepository;

  constructor(private readonly db: Db) {
    this.definitionRepository = new WorkflowDefinitionRepository(db);
    this.runRepository = new WorkflowRunRepository(db);
  }

  start(definitionId: string): WorkflowRunResponse {
    const transaction = this.db.transaction(() => {
      const definition = this.definitionRepository.findById(definitionId);

      if (!definition) {
        throw notFound(`Workflow definition '${definitionId}' was not found.`);
      }

      const timestamp = nowIso();
      const run: WorkflowRunRecord = {
        id: createId("run"),
        definitionId,
        status: "in_progress",
        definitionSnapshot: definition,
        currentTaskId: definition.startTaskId,
        currentStepIndex: null,
        data: {},
        stepDraft: null,
        revision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        canceledAt: null,
      };

      this.runRepository.create(run);

      let nextSequence = this.runRepository.nextEventSequence(run.id);
      const appendEvent = this.createEventAppender(nextSequence, (sequence) => {
        nextSequence = sequence;
      });

      advanceRun(run, appendEvent);
      run.updatedAt = nowIso();
      this.runRepository.update(run);

      return this.present(run.id);
    });

    return transaction();
  }

  get(runId: string): WorkflowRunResponse {
    return this.present(runId);
  }

  submit(
    runId: string,
    mode: SubmitMode,
    submittedData: Record<string, unknown>,
  ): WorkflowRunResponse {
    const transaction = this.db.transaction(() => {
      const run = this.getRunOrThrow(runId);
      this.ensureInProgress(run);

      const task = getTaskOrThrow(run.definitionSnapshot, run.currentTaskId);

      if (task.type !== "data_entry") {
        throw conflict("Current task is not a data-entry task.");
      }

      const stepIndex = run.currentStepIndex ?? 0;
      const step = task.steps[stepIndex];

      if (!step) {
        throw validationError("Current step does not exist.");
      }

      const existingDraft = getExistingDraft(run.stepDraft, task.id, stepIndex);
      const mergedData = {
        ...existingDraft,
        ...submittedData,
      };

      validateSubmissionData(step, mode, mergedData);

      if (mode === "save") {
        run.stepDraft = {
          taskId: task.id,
          stepIndex,
          data: mergedData,
        };
        run.data[task.id] = {
          ...(run.data[task.id] ?? {}),
          ...mergedData,
        };
        run.revision += 1;
        run.updatedAt = nowIso();
        this.runRepository.update(run);
        return this.present(run.id);
      }

      this.finishStep(run, task, stepIndex, mergedData);
      return this.present(run.id);
    });

    return transaction();
  }

  cancel(runId: string): WorkflowRunResponse {
    const transaction = this.db.transaction(() => {
      const run = this.getRunOrThrow(runId);
      this.ensureInProgress(run);

      const canceledAt = nowIso();
      run.status = "canceled";
      run.currentTaskId = null;
      run.currentStepIndex = null;
      run.stepDraft = null;
      run.canceledAt = canceledAt;
      run.updatedAt = canceledAt;
      run.revision += 1;

      this.runRepository.update(run);
      return this.present(run.id);
    });

    return transaction();
  }

  private finishStep(
    run: WorkflowRunRecord,
    task: DataEntryTask,
    stepIndex: number,
    mergedData: Record<string, unknown>,
  ): void {
    run.data[task.id] = {
      ...(run.data[task.id] ?? {}),
      ...mergedData,
    };
    run.stepDraft = null;

    const nextStepIndex = stepIndex + 1;

    if (nextStepIndex < task.steps.length) {
      run.currentTaskId = task.id;
      run.currentStepIndex = nextStepIndex;
      run.revision += 1;
      run.updatedAt = nowIso();
      this.runRepository.update(run);
      return;
    }

    let nextSequence = this.runRepository.nextEventSequence(run.id);
    const appendEvent = this.createEventAppender(nextSequence, (sequence) => {
      nextSequence = sequence;
    });
    const completedAt = nowIso();

    appendEvent({
      runId: run.id,
      taskId: task.id,
      taskType: task.type,
      event: {
        taskId: task.id,
        type: task.type,
        completedAt,
      },
      createdAt: completedAt,
    });

    run.currentTaskId = task.nextTaskId;
    run.currentStepIndex = null;

    advanceRun(run, appendEvent);
    run.revision += 1;
    run.updatedAt = nowIso();
    this.runRepository.update(run);
  }

  private createEventAppender(
    initialSequence: number,
    setNextSequence: (nextSequence: number) => void,
  ): EventAppender {
    let sequence = initialSequence;

    return (event: Omit<RunTaskEvent, "id" | "sequence">) => {
      const taskEvent = createTaskEvent(event, sequence);
      this.runRepository.appendEvent(taskEvent);
      sequence += 1;
      setNextSequence(sequence);
    };
  }

  private present(runId: string): WorkflowRunResponse {
    const run = this.getRunOrThrow(runId);
    const events = this.runRepository.listEvents(runId);
    return presentRun(run, events);
  }

  private getRunOrThrow(runId: string): WorkflowRunRecord {
    const run = this.runRepository.findById(runId);

    if (!run) {
      throw notFound(`Workflow run '${runId}' was not found.`);
    }

    return run;
  }

  private ensureInProgress(run: WorkflowRunRecord): void {
    if (run.status !== "in_progress") {
      throw conflict(`Run '${run.id}' is not in progress.`);
    }
  }
}

function getExistingDraft(
  draft: StepDraft | null,
  taskId: string,
  stepIndex: number,
): Record<string, unknown> {
  if (draft && draft.taskId === taskId && draft.stepIndex === stepIndex) {
    return draft.data;
  }

  return {};
}
