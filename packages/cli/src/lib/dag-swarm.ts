import { z } from "zod";
import { buildSemanticRepoMap } from "./repo-map";

// ============================================================================
// 1. DAG TASK SCHEMAS & TYPES
// ============================================================================

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

export const DagTaskNodeSchema = z.object({
  id: z.string().describe("Unique task identifier (e.g. 'task-schema', 'task-middleware')"),
  title: z.string().describe("Concise human-readable title of the sub-task"),
  description: z
    .string()
    .describe("Detailed implementation instructions and acceptance criteria for the Worker Agent"),
  dependsOn: z
    .array(z.string())
    .describe("IDs of upstream tasks that must complete before this task can start"),
  targetFiles: z
    .array(z.string())
    .describe("Exact relative POSIX paths of files this task will create or modify"),
  readOnlyContextFiles: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Additional files the Worker should inspect as read-only reference"),
  verificationCommand: z
    .string()
    .optional()
    .describe("Optional fast verification command (e.g. 'bun test src/auth.test.ts')"),
});

export const SwarmTaskDagSchema = z.object({
  goalSummary: z.string(),
  architecturalNotes: z.string(),
  tasks: z.array(DagTaskNodeSchema).min(1),
  finalVerificationCommand: z.string().optional(),
});

export type DagTaskNode = z.infer<typeof DagTaskNodeSchema>;
export type DagTaskNodeInput = z.input<typeof DagTaskNodeSchema>;
export type SwarmTaskDag = z.infer<typeof SwarmTaskDagSchema>;
export type SwarmTaskDagInput = z.input<typeof SwarmTaskDagSchema>;

export interface UpstreamContract {
  taskId: string;
  title: string;
  modifiedFiles: string[];
  exportedSignaturesSummary: string;
}

export interface CriticReviewResult {
  approved: boolean;
  severity: "pass" | "warning" | "blocker";
  feedback: string;
  failedFiles: string[];
}

export interface WaveExecutionReport {
  waveIndex: number;
  taskIds: string[];
  parallelFactor: number;
  contracts: UpstreamContract[];
  criticReview: CriticReviewResult;
  elapsedMs: number;
}

export interface CompiledDagPlan {
  waves: DagTaskNode[][];
  autoSerializedPairs: Array<{
    earlierTask: string;
    laterTask: string;
    conflictingFile: string;
  }>;
  criticalPathLength: number;
  maxParallelism: number;
}

// ============================================================================
// 2. KAHN'S TOPOLOGICAL WAVE COMPILER + DISJOINT WRITE-SET GUARD
// ============================================================================

/**
 * Compiles a `SwarmTaskDag` into parallel execution waves using Kahn's algorithm,
 * and enforces file-level write isolation within every wave so parallel Worker
 * Agents never overwrite each other's files concurrently.
 */
export function compileTopologicalWaves(rawDag: SwarmTaskDagInput | SwarmTaskDag): CompiledDagPlan {
  const dag = SwarmTaskDagSchema.parse(rawDag);
  const taskMap = new Map<string, DagTaskNode>();
  for (const t of dag.tasks) {
    if (taskMap.has(t.id)) {
      throw new Error(`Duplicate DAG task ID detected: "${t.id}"`);
    }
    taskMap.set(t.id, {
      ...t,
      dependsOn: [...t.dependsOn],
      targetFiles: t.targetFiles.map(toPosixPath),
      readOnlyContextFiles: (t.readOnlyContextFiles ?? []).map(toPosixPath),
    });
  }

  // Validate all dependency references exist
  for (const t of taskMap.values()) {
    for (const depId of t.dependsOn) {
      if (!taskMap.has(depId)) {
        throw new Error(`Task "${t.id}" depends on unknown task ID "${depId}"`);
      }
      if (depId === t.id) {
        throw new Error(`Task "${t.id}" cannot depend on itself`);
      }
    }
  }

  // Kahn's algorithm to extract topological levels (waves)
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const t of taskMap.values()) {
    inDegree.set(t.id, t.dependsOn.length);
    for (const dep of t.dependsOn) {
      const list = dependents.get(dep) ?? [];
      list.push(t.id);
      dependents.set(dep, list);
    }
  }

  const rawWaves: DagTaskNode[][] = [];
  let visitedCount = 0;
  let frontier = Array.from(taskMap.values()).filter((t) => (inDegree.get(t.id) ?? 0) === 0);

  while (frontier.length > 0) {
    rawWaves.push(frontier);
    visitedCount += frontier.length;

    const nextFrontier: DagTaskNode[] = [];
    for (const node of frontier) {
      for (const childId of dependents.get(node.id) ?? []) {
        const nextDeg = (inDegree.get(childId) ?? 1) - 1;
        inDegree.set(childId, nextDeg);
        if (nextDeg === 0) {
          nextFrontier.push(taskMap.get(childId)!);
        }
      }
    }
    frontier = nextFrontier;
  }

  if (visitedCount !== taskMap.size) {
    const stuck = Array.from(taskMap.keys()).filter((id) => (inDegree.get(id) ?? 0) > 0);
    throw new Error(
      `Cycle detected in Sub-Agent Task DAG involving tasks: [${stuck.join(", ")}]`
    );
  }

  // Enforce Write-Set Disjointness within each wave:
  // If two tasks in the same wave touch the same file in `targetFiles`, split them into
  // sequential sub-waves so concurrent workers never collide on disk.
  const safeWaves: DagTaskNode[][] = [];
  const autoSerializedPairs: Array<{
    earlierTask: string;
    laterTask: string;
    conflictingFile: string;
  }> = [];

  for (const wave of rawWaves) {
    const subWaves: DagTaskNode[][] = [];
    const subWaveLockedFiles: Array<Set<string>> = [];
    const subWaveOwnerMap: Array<Map<string, string>> = [];

    for (const task of wave) {
      let placedIdx = -1;

      for (let s = 0; s < subWaves.length; s++) {
        const locked = subWaveLockedFiles[s]!;
        const conflict = task.targetFiles.find((f) => locked.has(f));
        if (!conflict) {
          placedIdx = s;
          break;
        } else {
          const ownerTask = subWaveOwnerMap[s]!.get(conflict) ?? "unknown";
          autoSerializedPairs.push({
            earlierTask: ownerTask,
            laterTask: task.id,
            conflictingFile: conflict,
          });
        }
      }

      if (placedIdx === -1) {
        placedIdx = subWaves.length;
        subWaves.push([]);
        subWaveLockedFiles.push(new Set());
        subWaveOwnerMap.push(new Map());
      }

      subWaves[placedIdx]!.push(task);
      for (const f of task.targetFiles) {
        subWaveLockedFiles[placedIdx]!.add(f);
        subWaveOwnerMap[placedIdx]!.set(f, task.id);
      }
    }

    safeWaves.push(...subWaves);
  }

  const maxParallelism = safeWaves.reduce((max, w) => Math.max(max, w.length), 0);

  return {
    waves: safeWaves,
    autoSerializedPairs,
    criticalPathLength: safeWaves.length,
    maxParallelism,
  };
}

// ============================================================================
// 3. CONTEXT ISOLATION & TOKEN/LATENCY BENCHMARK MODELER
// ============================================================================

export interface ArchitectureComparisonMetrics {
  taskCount: number;
  singleAgentLoop: {
    estimatedTotalTokens: number;
    estimatedLatencySec: number;
    contextPollutionRisk: "High (quadratic O(N^2) history accumulation)";
  };
  dagSwarmOrchestrator: {
    estimatedTotalTokens: number;
    estimatedLatencySec: number;
    tokenSavingsPercent: number;
    speedupFactor: number;
    contextPollutionRisk: "Minimal (isolated O(N) worker windows + contract passing)";
  };
}

/**
 * Analytically compares a Single-Agent Sequential Tool Loop against the
 * Planner-Worker-Critic 3-Agent DAG Swarm for a given compiled DAG plan.
 */
export function compareSingleAgentVsSwarm(
  plan: CompiledDagPlan,
  avgTokensPerFileRead = 1400,
  avgStepLatencySec = 6.5
): ArchitectureComparisonMetrics {
  const allTasks = plan.waves.flat();
  const N = allTasks.length;

  // Single-agent loop accumulates every prior file read, grep output, and tool result
  // in its growing conversation history across all N sub-tasks: sum_{i=1..N} (base + i * stepContext)
  const baseSystemTokens = 1800;
  const stepContextGrowth = avgTokensPerFileRead * 2.2;
  let singleAgentTokens = 0;
  const stepsPerTask = 3;
  const totalSingleSteps = N * stepsPerTask;

  for (let step = 1; step <= totalSingleSteps; step++) {
    singleAgentTokens += baseSystemTokens + step * (stepContextGrowth / stepsPerTask);
  }
  const singleAgentLatency = totalSingleSteps * avgStepLatencySec;

  // DAG Swarm:
  // 1. Architect uses 1 RepoMap (<1,800 tokens) + prompt -> ~3,200 tokens
  const architectTokens = 3200;
  // 2. Each Worker has an isolated window: base prompt (1,200) + target files + 250-token upstream contract
  const workerTokensPerTask =
    stepsPerTask * (1200 + avgTokensPerFileRead * 1.5 + 250);
  // 3. Critic reviews compact unified diff per wave (~1,500 tokens/wave)
  const criticTokens = plan.waves.length * 1500;

  const swarmTotalTokens = Math.round(
    architectTokens + N * workerTokensPerTask + criticTokens
  );

  // Latency is proportional to the number of topological waves (since tasks in a wave run in parallel)
  const swarmLatency = Number(
    (8.0 + plan.waves.length * (stepsPerTask * avgStepLatencySec + 3.5)).toFixed(1)
  );

  const tokenSavingsPercent = Number(
    (((singleAgentTokens - swarmTotalTokens) / singleAgentTokens) * 100).toFixed(1)
  );
  const speedupFactor = Number((singleAgentLatency / swarmLatency).toFixed(2));

  return {
    taskCount: N,
    singleAgentLoop: {
      estimatedTotalTokens: Math.round(singleAgentTokens),
      estimatedLatencySec: Number(singleAgentLatency.toFixed(1)),
      contextPollutionRisk: "High (quadratic O(N^2) history accumulation)",
    },
    dagSwarmOrchestrator: {
      estimatedTotalTokens: swarmTotalTokens,
      estimatedLatencySec: swarmLatency,
      tokenSavingsPercent,
      speedupFactor,
      contextPollutionRisk: "Minimal (isolated O(N) worker windows + contract passing)",
    },
  };
}

// ============================================================================
// 4. ISOLATED WORKER PROMPT BUILDER
// ============================================================================

/**
 * Builds the isolated prompt for an individual Worker Sub-Agent so it never sees
 * unrelated files or noisy exploration logs from sibling workers.
 */
export function buildIsolatedWorkerPrompt(
  task: DagTaskNode,
  upstreamContracts: UpstreamContract[]
): string {
  const relevantContracts = upstreamContracts.filter((c) =>
    task.dependsOn.includes(c.taskId)
  );

  const contractsXml =
    relevantContracts.length > 0
      ? relevantContracts
          .map(
            (c) =>
              `<upstream_contract task_id="${c.taskId}" files="${c.modifiedFiles.join(", ")}">\n${c.exportedSignaturesSummary}\n</upstream_contract>`
          )
          .join("\n")
      : "<upstream_contract>None (Root Wave Task)</upstream_contract>";

  return [
    `You are an isolated ThinkToCode Worker Agent executing DAG node "${task.id}" (${task.title}).`,
    `## Strict File Scope Lock`,
    `- You are ONLY permitted to create or modify these files: ${task.targetFiles.join(", ")}`,
    `- Read-only reference files: ${
      task.readOnlyContextFiles.length > 0 ? task.readOnlyContextFiles.join(", ") : "None"
    }`,
    `## Completed Upstream Dependency Contracts`,
    contractsXml,
    `## Task Specification`,
    task.description,
    `## Deliverable Output Format`,
    `After applying your changes with patchFile/editFile/writeFile, end your response with a concise <contract_summary> listing the exact exported types/functions you created or updated.`,
  ].join("\n\n");
}

// ============================================================================
// 5. SWARM PROGRESS EVENTS & ORCHESTRATION HELPERS
// ============================================================================

export interface SwarmProgressEvent {
  phase:
    | "repo-map"
    | "architect-dag"
    | "wave-start"
    | "worker-done"
    | "critic-review"
    | "complete";
  message: string;
  payload?: unknown;
}

export interface SwarmExecutionPlanResult {
  dag: SwarmTaskDag;
  compiledPlan: CompiledDagPlan;
  metrics: ArchitectureComparisonMetrics;
}

/**
 * Creates a validated Swarm Task DAG from a decomposed plan structure.
 */
export function createSwarmPlan(rawDag: SwarmTaskDagInput | SwarmTaskDag | unknown): SwarmExecutionPlanResult {
  const dag = SwarmTaskDagSchema.parse(rawDag);
  const compiledPlan = compileTopologicalWaves(dag);
  const metrics = compareSingleAgentVsSwarm(compiledPlan);
  return { dag, compiledPlan, metrics };
}
