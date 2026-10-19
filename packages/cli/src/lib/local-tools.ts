
import { existsSync } from "fs";

function resolveGrepCommand(): string {
  if (process.platform === "win32") {
    const gitGrep = "C:\\Program Files\\Git\\usr\\bin\\grep.exe";
    if (existsSync(gitGrep)) return gitGrep;
  }
  return "grep";
}

function resolveBashCommand(cmd: string): { command: string[]; env?: Record<string, string> } {
  if (process.platform === "win32") {
    const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
    if (existsSync(gitBash)) {
      return { command: [gitBash, "-c", cmd] };
    }
    return { command: ["cmd.exe", "/c", cmd] };
  }
  return { command: ["bash", "-c", cmd] };
}
import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { checkpointManager } from "./checkpoints";
import { checkFileDiagnostics } from "./diagnostics";
import { applyFuzzyUnifiedDiff } from "./fuzzy-patch";
import { buildSemanticRepoMap } from "./repo-map";
import { createSwarmPlan } from "./dag-swarm";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { toolInputSchemas, Mode, type ModeType } from "@thinktocode/shared";

const MAX_FILE_SIZE = 10_000;
const MAX_RESULTS = 200;
const MAX_MATCHES = 50;
const MAX_OUTPUT = 20_000;
const DEFAULT_TIMEOUT = 30_000;

function getWorkspaceRoot(): string {
  let curr = process.cwd();
  while (curr !== dirname(curr)) {
    if (
      existsSync(join(curr, ".git")) ||
      (existsSync(join(curr, "packages")) && existsSync(join(curr, "package.json")))
    ) {
      return curr;
    }
    curr = dirname(curr);
  }
  return process.cwd();
}

function resolveInsideCwd(path: string) {
  let cwd = process.cwd();
  const directResolved = resolve(cwd, path);

  if (!existsSync(directResolved)) {
    const root = getWorkspaceRoot();
    if (root !== cwd && existsSync(resolve(root, path))) {
      cwd = root;
    }
  }

  const resolved = resolve(cwd, path);
  const rel = relative(cwd, resolved);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Path is outside the project directory");
  }

  return { cwd, resolved };
}

function truncate(value: string, limit: number) {
  return value.length > limit
    ? `${value.slice(0, limit)}\n... (truncated, ${value.length} total chars)`
    : value;
}

export async function executeLocalTool(toolName: string, input: unknown, mode: ModeType) {
  if (mode === Mode.PLAN && !["planSwarmDag", "repoMap", "readFile", "listDirectory", "glob", "grep"].includes(toolName)) {
    throw new Error(`Tool ${toolName} is not available in PLAN mode`);
  }

  switch (toolName) {
    case "planSwarmDag": {
      const inputData = toolInputSchemas.planSwarmDag.parse(input);
      const swarmPlan = createSwarmPlan({
        goalSummary: inputData.goal,
        architecturalNotes: "Decomposed multi-agent execution plan",
        tasks: inputData.tasks,
      });
      return {
        goalSummary: swarmPlan.dag.goalSummary,
        wavesCount: swarmPlan.compiledPlan.waves.length,
        criticalPathLength: swarmPlan.compiledPlan.criticalPathLength,
        maxParallelism: swarmPlan.compiledPlan.maxParallelism,
        autoSerializedPairs: swarmPlan.compiledPlan.autoSerializedPairs,
        waves: swarmPlan.compiledPlan.waves.map((wave, idx) => ({
          wave: idx + 1,
          parallelTasks: wave.map((t) => ({
            id: t.id,
            title: t.title,
            targetFiles: t.targetFiles,
            dependsOn: t.dependsOn,
          })),
        })),
        metrics: swarmPlan.metrics,
      };
    }
    case "repoMap": {
      const { query } = toolInputSchemas.repoMap.parse(input);
      const result = await buildSemanticRepoMap({
        cwd: process.cwd(),
        query,
        maxTokens: 1800,
      });
      return {
        repoMap: result.renderedMap,
        tokenEstimate: result.tokenEstimate,
        totalFilesScanned: result.totalFilesScanned,
        topRankedFiles: result.topRankedFiles,
      };
    }
    case "readFile": {
      const { path } = toolInputSchemas.readFile.parse(input);
      const { resolved } = resolveInsideCwd(path);
      const content = await readFile(resolved, "utf-8");
      return content.length > MAX_FILE_SIZE
        ? { content: content.slice(0, MAX_FILE_SIZE), truncated: true, totalLength: content.length }
        : { content };
    }
    case "listDirectory": {
      const { path } = toolInputSchemas.listDirectory.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const entries = await readdir(resolved);
      const results: { name: string; type: "file" | "directory" }[] = [];

      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        const info = await stat(join(resolved, entry));
        results.push({ name: entry, type: info.isDirectory() ? "directory" : "file" });
      }

      results.sort((a, b) =>
        a.type !== b.type ? (a.type === "directory" ? -1 : 1) : a.name.localeCompare(b.name),
      );
      return { path: relative(cwd, resolved) || ".", entries: results };
    }
    case "glob": {
      const { pattern, path } = toolInputSchemas.glob.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const glob = new Bun.Glob(pattern);
      const files: string[] = [];
      let truncated = false;

      for await (const match of glob.scan({ cwd: resolved, dot: false, onlyFiles: true })) {
        if (match.includes("node_modules")) continue;
        if (files.length >= MAX_RESULTS) {
          truncated = true;
          break;
        }
        files.push(relative(cwd, resolve(resolved, match)));
      }

      files.sort();
      return { files, ...(truncated ? { truncated: true } : {}) };
    }
    case "grep": {
      const { pattern, path, include } = toolInputSchemas.grep.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const args = [
        "-rn",
        "--color=never",
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        "-E",
      ];
      if (include) args.push(`--include=${include}`);
      args.push(pattern, resolved);

      const proc = Bun.spawn([resolveGrepCommand(), ...args], { cwd, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;

      if (exitCode !== 0 && exitCode !== 1) throw new Error(`grep failed: ${stderr.trim()}`);
      if (!stdout.trim()) return { matches: [], message: "No matches found" };

      const lines = stdout.trim().split("\n");
      const matches: { file: string; line: number; content: string }[] = [];
      let truncated = false;

      for (const line of lines) {
        if (matches.length >= MAX_MATCHES) {
          truncated = true;
          break;
        }
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          matches.push({
            file: relative(cwd, match[1]!),
            line: Number(match[2]),
            content: match[3]!,
          });
        }
      }

      return { matches, ...(truncated ? { truncated: true, totalMatches: lines.length } : {}) };
    }
    case "writeFile": {
      const { path, content } = toolInputSchemas.writeFile.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      checkpointManager.captureFileBeforeMutation(resolved, relative(cwd, resolved));
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content, "utf-8");
      const diag = checkFileDiagnostics(resolved, content);
      return {
        success: true as const,
        path: relative(cwd, resolved),
        bytesWritten: Buffer.byteLength(content, "utf-8"),
        ...(diag ? { diagnostics: diag } : {}),
      };
    }
    case "editFile": {
      const parsed = toolInputSchemas.editFile.parse(input);
      const hunks: { oldString: string; newString: string }[] =
        parsed.edits && parsed.edits.length > 0
          ? parsed.edits
          : parsed.oldString != null && parsed.newString != null
            ? [{ oldString: parsed.oldString, newString: parsed.newString }]
            : [];

      if (hunks.length === 0) {
        throw new Error("Either (oldString and newString) or edits array must be provided for editFile");
      }

      const { cwd, resolved } = resolveInsideCwd(parsed.path);
      let fileContent = await readFile(resolved, "utf-8");

      // Validate all hunks before applying any modifications
      const matches: { start: number; end: number; newString: string; oldString: string }[] = [];

      for (let i = 0; i < hunks.length; i++) {
        const hunk = hunks[i]!;
        const occurrences = fileContent.split(hunk.oldString).length - 1;

        if (occurrences === 0) {
          throw new Error(`Hunk ${i + 1}/${hunks.length} failed: oldString not found in ${parsed.path}`);
        }
        if (occurrences > 1) {
          throw new Error(`Hunk ${i + 1}/${hunks.length} failed: oldString is ambiguous (${occurrences} matches found in ${parsed.path})`);
        }

        const index = fileContent.indexOf(hunk.oldString);
        matches.push({
          start: index,
          end: index + hunk.oldString.length,
          newString: hunk.newString,
          oldString: hunk.oldString,
        });
      }

      // Check for overlapping hunks
      matches.sort((a, b) => a.start - b.start);
      for (let i = 0; i < matches.length - 1; i++) {
        const current = matches[i]!;
        const next = matches[i + 1]!;
        if (current.end > next.start) {
          throw new Error(`Overlapping edit hunks detected in ${parsed.path}`);
        }
      }

      // Capture pre-modification snapshot
      checkpointManager.captureFileBeforeMutation(resolved, relative(cwd, resolved));

      // Apply substitutions from back to front
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i]!;
        fileContent = fileContent.slice(0, match.start) + match.newString + fileContent.slice(match.end);
      }

      await writeFile(resolved, fileContent, "utf-8");
      const diag = checkFileDiagnostics(resolved, fileContent);
      return { 
        success: true as const, 
        path: relative(cwd, resolved),
        hunksApplied: hunks.length,
        ...(diag ? { diagnostics: diag } : {}),
      };
    }
    case "bash": {
      const { command, timeout = DEFAULT_TIMEOUT } = toolInputSchemas.bash.parse(input);
      const proc = Bun.spawn(resolveBashCommand(command).command, {
        cwd: resolveInsideCwd(".").resolved,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, TERM: "dumb" },
      });
      const timer = setTimeout(() => proc.kill(), timeout);
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;
      clearTimeout(timer);
      return {
        stdout: truncate(stdout, MAX_OUTPUT),
        stderr: truncate(stderr, MAX_OUTPUT),
        exitCode,
      };
    }
    case "patchFile": {
      const { path, patch, previewOnly = false } = toolInputSchemas.patchFile.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const originalContent = await readFile(resolved, "utf-8");
      const result = applyFuzzyUnifiedDiff(originalContent, patch);

      if (!result.success || result.patchedContent === undefined) {
        throw new Error(
          result.failedHunk?.reason ?? "Failed to apply unified diff patch"
        );
      }

      if (!previewOnly) {
        checkpointManager.captureFileBeforeMutation(resolved, relative(cwd, resolved));
        await writeFile(resolved, result.patchedContent, "utf-8");
      }

      const diag = !previewOnly ? checkFileDiagnostics(resolved, result.patchedContent) : undefined;

      return {
        success: true as const,
        previewOnly,
        path: relative(cwd, resolved),
        hunksApplied: result.appliedHunks.length,
        appliedHunks: result.appliedHunks,
        additions: result.sideBySidePreview?.additions ?? 0,
        deletions: result.sideBySidePreview?.deletions ?? 0,
        sideBySidePreview: result.sideBySidePreview?.ansiSplitString ?? "",
        ...(diag ? { diagnostics: diag } : {}),
      };
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};
