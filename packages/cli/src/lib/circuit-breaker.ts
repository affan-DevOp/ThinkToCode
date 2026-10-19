export type CircuitBreakerConfig = {
  maxConsecutiveIdenticalCalls?: number;
  maxConsecutiveFailures?: number;
  maxOscillatingCycles?: number;
  maxStepsPerTurn?: number;
};

export type CircuitCheckResult = {
  tripped: boolean;
  reason?: string;
  rule?: "identical" | "failures" | "oscillation" | "budget";
};

type ToolExecutionRecord = {
  fingerprint: string;
  toolName: string;
  input: unknown;
  success: boolean;
  error?: string;
  timestamp: number;
};

function stableSerialize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return String(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableSerialize).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => `"${k}":${stableSerialize((obj as Record<string, unknown>)[k])}`);
  return "{" + pairs.join(",") + "}";
}

export function computeToolFingerprint(toolName: string, input: unknown): string {
  return `${toolName}:${stableSerialize(input)}`;
}

export class CircuitBreaker {
  private history: ToolExecutionRecord[] = [];
  private stepCount = 0;

  readonly maxConsecutiveIdenticalCalls: number;
  readonly maxConsecutiveFailures: number;
  readonly maxOscillatingCycles: number;
  readonly maxStepsPerTurn: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.maxConsecutiveIdenticalCalls = config.maxConsecutiveIdenticalCalls ?? 3;
    this.maxConsecutiveFailures = config.maxConsecutiveFailures ?? 3;
    this.maxOscillatingCycles = config.maxOscillatingCycles ?? 2;
    this.maxStepsPerTurn = config.maxStepsPerTurn ?? 20;
  }

  /**
   * Evaluates if the proposed tool call trips any circuit breaker condition.
   */
  check(toolName: string, input: unknown): CircuitCheckResult {
    const fingerprint = computeToolFingerprint(toolName, input);

    // Rule 1: Step budget per turn
    if (this.stepCount >= this.maxStepsPerTurn) {
      return {
        tripped: true,
        rule: "budget",
        reason: `Turn step ceiling reached (${this.maxStepsPerTurn} tool executions in a single user turn)`,
      };
    }

    // Rule 2: Consecutive identical calls (same tool + same arguments)
    if (this.history.length >= this.maxConsecutiveIdenticalCalls - 1) {
      const recent = this.history.slice(-(this.maxConsecutiveIdenticalCalls - 1));
      const allIdentical = recent.every((r) => r.fingerprint === fingerprint);
      if (allIdentical) {
        return {
          tripped: true,
          rule: "identical",
          reason: `Repeated identical tool call '${toolName}' ${this.maxConsecutiveIdenticalCalls} times consecutively`,
        };
      }
    }

    // Rule 3: Consecutive failures without recovery
    if (this.history.length >= this.maxConsecutiveFailures) {
      const recentFailures = this.history.slice(-this.maxConsecutiveFailures);
      const allFailed = recentFailures.every((r) => !r.success);
      if (allFailed) {
        return {
          tripped: true,
          rule: "failures",
          reason: `Tool execution failed ${this.maxConsecutiveFailures} consecutive times without recovery`,
        };
      }
    }

    // Rule 4: Oscillation / Ping-pong loop (e.g. A -> B -> A -> B)
    if (this.history.length >= 3) {
      const len = this.history.length;
      const prev1 = this.history[len - 1]; // B
      const prev2 = this.history[len - 2]; // A
      const prev3 = this.history[len - 3]; // B
      // If history is [... B, A, B] and next call is A:
      if (
        prev1 && prev2 && prev3 &&
        prev1.fingerprint !== prev2.fingerprint &&
        prev1.fingerprint === prev3.fingerprint &&
        prev2.fingerprint === fingerprint
      ) {
        return {
          tripped: true,
          rule: "oscillation",
          reason: `Oscillating loop detected alternating between '${toolName}' and '${prev1.toolName}'`,
        };
      }
    }

    return { tripped: false };
  }

  /**
   * Records the outcome of a tool execution.
   */
  recordResult(toolName: string, input: unknown, success: boolean, error?: string): void {
    this.stepCount++;
    this.history.push({
      fingerprint: computeToolFingerprint(toolName, input),
      toolName,
      input,
      success,
      error,
      timestamp: Date.now(),
    });
  }

  /**
   * Resets turn counter and execution history (e.g. when user submits a new prompt).
   */
  reset(): void {
    this.history = [];
    this.stepCount = 0;
  }

  get currentStepCount(): number {
    return this.stepCount;
  }

  get historyLength(): number {
    return this.history.length;
  }
}
