export type FieldType = "text" | "number" | "single_select" | "multi_select";

export type WorkflowDefinition = {
  id: string;
  name: string;
  description?: string;
  startTaskId: string;
  tasks: TaskDefinition[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowDefinitionInput = {
  name: string;
  description?: string;
  startTaskId: string;
  tasks: TaskDefinition[];
};

export type TaskDefinition = DataEntryTask | BranchTask | TerminalTask;

export type DataEntryTask = {
  id: string;
  type: "data_entry";
  name: string;
  nextTaskId: string;
  steps: DataEntryStep[];
};

export type DataEntryStep = {
  id: string;
  name: string;
  fields: FieldDefinition[];
};

export type FieldDefinition =
  | TextField
  | NumberField
  | SingleSelectField
  | MultiSelectField;

export type BaseField = {
  id: string;
  label: string;
  required?: boolean;
};

export type TextField = BaseField & {
  type: "text";
};

export type NumberField = BaseField & {
  type: "number";
};

export type SingleSelectField = BaseField & {
  type: "single_select";
  options: SelectOption[];
};

export type MultiSelectField = BaseField & {
  type: "multi_select";
  options: SelectOption[];
};

export type SelectOption = {
  label: string;
  value: string;
};

export type BranchTask = {
  id: string;
  type: "branch";
  name: string;
  rules: BranchRule[];
  fallbackTaskId: string;
};

export type BranchRule = {
  when: BranchCondition;
  nextTaskId: string;
};

export type BranchCondition = {
  left: BranchOperand;
  operator: BranchOperator;
  right: BranchOperand | BranchLiteral;
};

export type BranchOperand = {
  var: string;
};

export type BranchLiteral = string | number | boolean | string[] | number[];

export type BranchOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "in";

export type TerminalTask = {
  id: string;
  type: "terminal";
  name: string;
};

export type RunStatus = "in_progress" | "completed" | "canceled";

export type RunData = Record<string, Record<string, unknown>>;

export type StepDraft = {
  taskId: string;
  stepIndex: number;
  data: Record<string, unknown>;
};

export type WorkflowRunRecord = {
  id: string;
  definitionId: string;
  status: RunStatus;
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

export type RunTaskEvent = {
  id: string;
  runId: string;
  taskId: string;
  taskType: TaskDefinition["type"];
  sequence: number;
  event: Record<string, unknown>;
  createdAt: string;
};

export type ActiveTask = {
  id: string;
  type: "data_entry";
  name: string;
  currentStep: DataEntryStep & { index: number };
  savedData: Record<string, unknown>;
};

export type WorkflowRunResponse = {
  id: string;
  definitionId: string;
  status: RunStatus;
  activeTask: ActiveTask | null;
  doneTasks: Record<string, unknown>[];
  data: RunData;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
};

export type SubmitMode = "save" | "finish";
