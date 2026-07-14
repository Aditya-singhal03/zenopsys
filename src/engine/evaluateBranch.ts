import type {
  BranchCondition,
  BranchOperand,
  BranchRule,
  BranchTask,
  RunData,
} from "../shared/types.js";

export type BranchEvaluation = {
  ruleIndex: number;
  left: string;
  leftValue: unknown;
  operator: BranchCondition["operator"];
  rightValue: unknown;
  matched: boolean;
};

export type BranchEvaluationResult = {
  selectedTaskId: string;
  matchedRuleIndex: number | null;
  evaluations: BranchEvaluation[];
};

export function evaluateBranch(
  task: BranchTask,
  data: RunData,
): BranchEvaluationResult {
  const evaluations: BranchEvaluation[] = [];

  for (let index = 0; index < task.rules.length; index += 1) {
    const rule = task.rules[index] as BranchRule;
    const evaluation = evaluateRule(rule, index, data);
    evaluations.push(evaluation);

    if (evaluation.matched) {
      return {
        selectedTaskId: rule.nextTaskId,
        matchedRuleIndex: index,
        evaluations,
      };
    }
  }

  return {
    selectedTaskId: task.fallbackTaskId,
    matchedRuleIndex: null,
    evaluations,
  };
}

function evaluateRule(
  rule: BranchRule,
  ruleIndex: number,
  data: RunData,
): BranchEvaluation {
  const condition = rule.when;
  const leftValue = resolveOperand(condition.left, data);
  const rightValue = isOperand(condition.right)
    ? resolveOperand(condition.right, data)
    : condition.right;

  return {
    ruleIndex,
    left: condition.left.var,
    leftValue,
    operator: condition.operator,
    rightValue,
    matched: evaluateCondition(condition, leftValue, rightValue),
  };
}

function evaluateCondition(
  condition: BranchCondition,
  leftValue: unknown,
  rightValue: unknown,
): boolean {
  if (leftValue === undefined || rightValue === undefined) {
    return false;
  }

  switch (condition.operator) {
    case "eq":
      return leftValue === rightValue;
    case "neq":
      return leftValue !== rightValue;
    case "gt":
      return compareNumbers(leftValue, rightValue, (left, right) => left > right);
    case "gte":
      return compareNumbers(leftValue, rightValue, (left, right) => left >= right);
    case "lt":
      return compareNumbers(leftValue, rightValue, (left, right) => left < right);
    case "lte":
      return compareNumbers(leftValue, rightValue, (left, right) => left <= right);
    case "contains":
      return contains(leftValue, rightValue);
    case "in":
      return Array.isArray(rightValue) && rightValue.includes(leftValue as never);
  }
}

function compareNumbers(
  leftValue: unknown,
  rightValue: unknown,
  compare: (left: number, right: number) => boolean,
): boolean {
  return (
    typeof leftValue === "number" &&
    typeof rightValue === "number" &&
    compare(leftValue, rightValue)
  );
}

function contains(leftValue: unknown, rightValue: unknown): boolean {
  if (Array.isArray(leftValue)) {
    return leftValue.includes(rightValue as never);
  }

  if (typeof leftValue === "string" && typeof rightValue === "string") {
    return leftValue.includes(rightValue);
  }

  return false;
}

function resolveOperand(operand: BranchOperand, data: RunData): unknown {
  const [taskId, fieldId] = operand.var.split(".");
  return data[taskId]?.[fieldId];
}

function isOperand(value: unknown): value is BranchOperand {
  return (
    typeof value === "object" &&
    value !== null &&
    "var" in value &&
    typeof (value as BranchOperand).var === "string"
  );
}
