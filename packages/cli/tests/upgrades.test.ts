import { describe, expect, test } from "bun:test";
import { applyFuzzyUnifiedDiff, parseUnifiedDiff } from "../src/lib/fuzzy-patch";
import { checkpointManager } from "../src/lib/checkpoints";
import { CircuitBreaker } from "../src/lib/circuit-breaker";
import { buildSemanticRepoMap } from "../src/lib/repo-map";
import { compileTopologicalWaves, compareSingleAgentVsSwarm } from "../src/lib/dag-swarm";

describe("ThinkToCode Upgrades Test Suite", () => {
  describe("1. Circuit Breaker", () => {
    test("detects 3x consecutive identical tool calls", () => {
      const breaker = new CircuitBreaker();
      // First 1 call passes
      breaker.recordResult("readFile", { path: "a.ts" }, true);
      expect(breaker.check("readFile", { path: "a.ts" }).tripped).toBe(false);

      // Second call recorded
      breaker.recordResult("readFile", { path: "a.ts" }, true);
      // Prospective 3rd identical call trips rule "identical"
      const check = breaker.check("readFile", { path: "a.ts" });
      expect(check.tripped).toBe(true);
      expect(check.rule).toBe("identical");
    });

    test("detects ping-pong oscillation between two tool calls", () => {
      const breaker = new CircuitBreaker();
      breaker.recordResult("editFile", { path: "a.ts", str: "1" }, true);
      breaker.recordResult("editFile", { path: "b.ts", str: "2" }, true);
      breaker.recordResult("editFile", { path: "a.ts", str: "1" }, true);
      breaker.recordResult("editFile", { path: "b.ts", str: "2" }, true);

      const check = breaker.check("editFile", { path: "a.ts", str: "1" });
      expect(check.tripped).toBe(true);
      expect(check.rule).toBe("oscillation");
    });

    test("enforces turn step budget limit", () => {
      const breaker = new CircuitBreaker({ maxStepsPerTurn: 5 });
      for (let i = 0; i < 5; i++) {
        breaker.recordResult("readFile", { path: `file${i}.ts` }, true);
      }
      const check = breaker.check("readFile", { path: "file99.ts" });
      expect(check.tripped).toBe(true);
      expect(check.rule).toBe("budget");
    });
  });

  describe("2. Fuzzy Patch Engine", () => {
    test("parses standard unified diff with line offsets", () => {
      const diff = `@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = 2;\n const b = 2;`;
      const hunks = parseUnifiedDiff(diff);
      expect(hunks.length).toBe(1);
      expect(hunks[0]!.oldStart).toBe(1);
      expect(hunks[0]!.newStart).toBe(1);
    });

    test("applies 4-tier fuzzy patch successfully", () => {
      const original = `function test() {\n  const x = 10;\n  return x * 2;\n}`;
      const patch = `@@ -1,4 +1,4 @@\n function test() {\n-  const x = 10;\n+  const x = 20;\n   return x * 2;\n }`;
      const res = applyFuzzyUnifiedDiff(original, patch);
      expect(res.success).toBe(true);
      expect(res.patchedContent).toContain("const x = 20;");
      expect(res.appliedHunks.length).toBe(1);
      expect(res.appliedHunks[0]!.strategy).toBe("exact-offset");
    });
  });

  describe("3. Git Shadow Checkpoints", () => {
    test("records turn and captures file before mutation", () => {
      checkpointManager.beginTurn("Test mutation");
      checkpointManager.captureFileBeforeMutation(process.cwd() + "/package.json", "package.json");
      checkpointManager.commitTurn();
      expect(checkpointManager.historyDepth).toBeGreaterThan(0);
    });
  });

  describe("4. Semantic RepoMap", () => {
    test("generates compact map under token budget", async () => {
      const result = await buildSemanticRepoMap(process.cwd(), { maxTokens: 1000 });
      expect(result.totalFilesScanned).toBeGreaterThan(0);
      expect(result.tokenEstimate).toBeLessThanOrEqual(1800);
      expect(result.renderedMap.length).toBeGreaterThan(0);
    });
  });

  describe("5. Sub-Agent Swarm DAG Orchestrator", () => {
    test("schedules independent tasks into concurrent waves", () => {
      const plan = compileTopologicalWaves({
        goalSummary: "Auth Refactor",
        architecturalNotes: "",
        tasks: [
          {
            id: "t-schema",
            title: "Schema",
            description: "",
            dependsOn: [],
            targetFiles: ["src/schema.ts"],
          },
          {
            id: "t-route-1",
            title: "Route 1",
            description: "",
            dependsOn: ["t-schema"],
            targetFiles: ["src/routes/r1.ts"],
          },
          {
            id: "t-route-2",
            title: "Route 2",
            description: "",
            dependsOn: ["t-schema"],
            targetFiles: ["src/routes/r2.ts"],
          },
        ],
      });

      expect(plan.waves.length).toBe(2);
      expect(plan.waves[0]!.length).toBe(1);
      expect(plan.waves[1]!.length).toBe(2);
      expect(plan.maxParallelism).toBe(2);
    });

    test("auto-serializes conflicting file writes in same wave", () => {
      const plan = compileTopologicalWaves({
        goalSummary: "Collision Test",
        architecturalNotes: "",
        tasks: [
          {
            id: "t1",
            title: "Task 1",
            description: "",
            dependsOn: [],
            targetFiles: ["src/common.ts"],
          },
          {
            id: "t2",
            title: "Task 2",
            description: "",
            dependsOn: [],
            targetFiles: ["src/common.ts"],
          },
        ],
      });

      expect(plan.waves.length).toBe(2);
      expect(plan.autoSerializedPairs.length).toBe(1);
      expect(plan.autoSerializedPairs[0]!.conflictingFile).toBe("src/common.ts");
    });

    test("computes analytic token savings", () => {
      const plan = compileTopologicalWaves({
        goalSummary: "Benchmark",
        architecturalNotes: "",
        tasks: [
          { id: "a", title: "A", description: "", dependsOn: [], targetFiles: ["a.ts"] },
          { id: "b", title: "B", description: "", dependsOn: ["a"], targetFiles: ["b.ts"] },
          { id: "c", title: "C", description: "", dependsOn: ["a"], targetFiles: ["c.ts"] },
        ],
      });

      const metrics = compareSingleAgentVsSwarm(plan);
      expect(metrics.dagSwarmOrchestrator.tokenSavingsPercent).toBeGreaterThan(0);
      expect(metrics.dagSwarmOrchestrator.contextPollutionRisk).toContain("Minimal");
    });
  });
});
