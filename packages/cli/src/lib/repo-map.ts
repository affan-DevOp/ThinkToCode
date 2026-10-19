import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

// ============================================================================
// TYPES & DATA STRUCTURES
// ============================================================================

export type SymbolKind = "function" | "class" | "interface" | "type" | "const";

export interface DefSymbol {
  name: string;
  kind: SymbolKind;
  signature: string;
  line: number;
}

export interface RefSymbol {
  name: string;
  line: number;
}

export interface FileSignatures {
  relativePath: string;
  mtimeMs: number;
  defs: DefSymbol[];
  refs: RefSymbol[];
}

export interface RepoMapCache {
  version: number;
  files: Record<string, FileSignatures>;
}

export interface SemanticRepoMapResult {
  renderedMap: string;
  tokenEstimate: number;
  totalFilesScanned: number;
  topRankedFiles: string[];
}

const CACHE_DIR = join(process.cwd(), ".cache");
const CACHE_FILE = join(CACHE_DIR, "repomap.json");

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  ".cache",
  ".next",
  "coverage",
  "generated",
]);

const SUPPORTED_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

// ============================================================================
// 1. AST SIGNATURE EXTRACTION
// ============================================================================

export function extractFileSignatures(
  content: string,
  relativePath: string,
  mtimeMs: number
): FileSignatures {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const defs: DefSymbol[] = [];
  const refs: RefSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const line = rawLine.trim();

    // Skip empty lines & full-line comments
    if (!line || line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
      continue;
    }

    // Match imports for reference tracking: import { foo, bar } from ...
    const importMatch = line.match(/^import\s+(?:type\s+)?(?:\{([^}]+)\}|([A-Za-z0-9_]+))/);
    if (importMatch) {
      const names = (importMatch[1] ?? importMatch[2] ?? "")
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/)[0]!)
        .filter(Boolean);
      for (const name of names) {
        refs.push({ name, line: i + 1 });
      }
      continue;
    }

    // Match export interface
    const interfaceMatch = line.match(/^(?:export\s+)?interface\s+([A-Za-z0-9_]+)(<[^>]+>)?/);
    if (interfaceMatch) {
      defs.push({
        name: interfaceMatch[1]!,
        kind: "interface",
        signature: line.replace(/\{.*$/, "").trim() + " { ... }",
        line: i + 1,
      });
      continue;
    }

    // Match export type
    const typeMatch = line.match(/^(?:export\s+)?type\s+([A-Za-z0-9_]+)(<[^>]+>)?\s*=/);
    if (typeMatch) {
      defs.push({
        name: typeMatch[1]!,
        kind: "type",
        signature: line.slice(0, 100).trim(),
        line: i + 1,
      });
      continue;
    }

    // Match export class
    const classMatch = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/);
    if (classMatch) {
      defs.push({
        name: classMatch[1]!,
        kind: "class",
        signature: line.replace(/\{.*$/, "").trim() + " { ... }",
        line: i + 1,
      });
      continue;
    }

    // Match export function
    const fnMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/);
    if (fnMatch) {
      defs.push({
        name: fnMatch[1]!,
        kind: "function",
        signature: line.replace(/\{.*$/, "").trim() + " { ... }",
        line: i + 1,
      });
      continue;
    }

    // Match export const/let/var function or constant
    const constMatch = line.match(/^export\s+(?:const|let)\s+([A-Za-z0-9_]+)(?::\s*([^=;]+))?/);
    if (constMatch) {
      const name = constMatch[1]!;
      const isFn = line.includes("=>") || line.includes("function");
      defs.push({
        name,
        kind: isFn ? "function" : "const",
        signature: line.replace(/\s*=\s*.*$/, "").trim() + (isFn ? " = (...) => { ... }" : ";"),
        line: i + 1,
      });
      continue;
    }
  }

  return { relativePath, mtimeMs, defs, refs };
}

// ============================================================================
// 2. CACHE MANAGEMENT
// ============================================================================

function loadCache(): RepoMapCache {
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}
  return { version: 1, files: {} };
}

function saveCache(cache: RepoMapCache): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch {}
}

// ============================================================================
// 3. BM25 SCORING & PERSONALIZED PAGERANK
// ============================================================================

export function computeBm25Scores(
  files: FileSignatures[],
  query: string
): Map<string, number> {
  const scores = new Map<string, number>();
  if (!query) {
    for (const f of files) scores.set(f.relativePath, 1.0);
    return scores;
  }

  const queryTerms = query.toLowerCase().split(/[^a-z0-9_]+/i).filter((t) => t.length > 2);
  if (queryTerms.length === 0) {
    for (const f of files) scores.set(f.relativePath, 1.0);
    return scores;
  }

  for (const f of files) {
    let matchScore = 0;
    const lowerPath = f.relativePath.toLowerCase();
    const symbolText = f.defs.map((d) => d.name.toLowerCase()).join(" ");

    for (const term of queryTerms) {
      if (lowerPath.includes(term)) matchScore += 3.0;
      if (symbolText.includes(term)) matchScore += 2.0;
    }

    scores.set(f.relativePath, matchScore > 0 ? matchScore : 0.1);
  }

  return scores;
}

export function computePageRank(
  files: FileSignatures[],
  bm25Scores: Map<string, number>,
  alpha = 0.85,
  iterations = 25
): Map<string, number> {
  const N = files.length;
  if (N === 0) return new Map();

  const fileMap = new Map<string, FileSignatures>();
  const symbolToFile = new Map<string, string>();
  for (const f of files) {
    fileMap.set(f.relativePath, f);
    for (const d of f.defs) {
      symbolToFile.set(d.name, f.relativePath);
    }
  }

  // Build adjacency matrix (out-edges from referencer to definer)
  const outEdges = new Map<string, string[]>();
  for (const f of files) {
    const targets = new Set<string>();
    for (const ref of f.refs) {
      const definer = symbolToFile.get(ref.name);
      if (definer && definer !== f.relativePath) {
        targets.add(definer);
      }
    }
    outEdges.set(f.relativePath, Array.from(targets));
  }

  // Personalization vector from BM25 scores
  let bm25Sum = 0;
  for (const f of files) {
    bm25Sum += bm25Scores.get(f.relativePath) ?? 0.1;
  }
  const p = new Map<string, number>();
  for (const f of files) {
    p.set(f.relativePath, (bm25Scores.get(f.relativePath) ?? 0.1) / Math.max(1e-6, bm25Sum));
  }

  // Initialize PageRank with personalization vector
  let r = new Map<string, number>(p);

  // Power iterations
  for (let it = 0; it < iterations; it++) {
    const nextR = new Map<string, number>();
    for (const f of files) {
      nextR.set(f.relativePath, (1 - alpha) * (p.get(f.relativePath) ?? 0));
    }

    for (const [source, targets] of outEdges.entries()) {
      const srcRank = r.get(source) ?? 0;
      if (targets.length === 0) {
        // Dangling node distributes uniformly
        for (const f of files) {
          nextR.set(f.relativePath, (nextR.get(f.relativePath) ?? 0) + (alpha * srcRank) / N);
        }
      } else {
        const share = (alpha * srcRank) / targets.length;
        for (const target of targets) {
          nextR.set(target, (nextR.get(target) ?? 0) + share);
        }
      }
    }

    r = nextR;
  }

  return r;
}

// ============================================================================
// 4. SEMANTIC REPOMAP BUILDER WITH BINARY SEARCH TOKEN BUDGETING
// ============================================================================

export async function scanProjectFiles(
  dir: string,
  baseDir = dir
): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const rel = relative(baseDir, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        const sub = await scanProjectFiles(fullPath, baseDir);
        result.push(...sub);
      }
    } else if (entry.isFile()) {
      const dotIdx = entry.name.lastIndexOf(".");
      const ext = dotIdx !== -1 ? entry.name.slice(dotIdx).toLowerCase() : "";
      if (SUPPORTED_EXTS.has(ext) && !entry.name.endsWith(".d.ts")) {
        result.push(rel);
      }
    }
  }

  return result;
}

export async function buildSemanticRepoMap(
  cwdOrOptions: string | { cwd?: string; query?: string; maxTokens?: number } = process.cwd(),
  maybeOptions?: { query?: string; maxTokens?: number }
): Promise<SemanticRepoMapResult> {
  const options = typeof cwdOrOptions === "string"
    ? { cwd: cwdOrOptions, ...maybeOptions }
    : cwdOrOptions;
  const cwd = options.cwd ?? process.cwd();
  const query = options.query ?? "";
  const maxTokens = options.maxTokens ?? 1800;
  const cache = loadCache();
  const filePaths = await scanProjectFiles(cwd);
  const fileSignaturesList: FileSignatures[] = [];

  for (const rel of filePaths) {
    const fullPath = resolve(cwd, rel);
    try {
      const s = await stat(fullPath);
      const cached = cache.files[rel];

      if (cached && cached.mtimeMs === s.mtimeMs) {
        fileSignaturesList.push(cached);
      } else {
        const content = readFileSync(fullPath, "utf-8");
        const extracted = extractFileSignatures(content, rel, s.mtimeMs);
        cache.files[rel] = extracted;
        fileSignaturesList.push(extracted);
      }
    } catch {}
  }

  saveCache(cache);

  // Compute BM25 + PageRank
  const bm25 = computeBm25Scores(fileSignaturesList, query);
  const ranks = computePageRank(fileSignaturesList, bm25);

  // Sort files by rank descending
  fileSignaturesList.sort((a, b) => (ranks.get(b.relativePath) ?? 0) - (ranks.get(a.relativePath) ?? 0));

  // Render top signatures with token budgeting
  const approxTokensPerChar = 0.26;
  const targetChars = maxTokens / approxTokensPerChar;

  let rendered = "";
  const includedFiles: string[] = [];

  for (const f of fileSignaturesList) {
    if (f.defs.length === 0) continue;

    const fileHeader = `${f.relativePath}:\n`;
    const symbolLines = f.defs.map((d) => `  ${d.signature}`).join("\n");
    const block = `${fileHeader}${symbolLines}\n\n`;

    if ((rendered.length + block.length) > targetChars) {
      if (rendered.length === 0) {
        // Take at least the first file truncated
        rendered += block.slice(0, Math.floor(targetChars));
        includedFiles.push(f.relativePath);
      } else {
        rendered += "  │⋮ (remaining architectural files elided to preserve token budget)\n";
      }
      break;
    }

    rendered += block;
    includedFiles.push(f.relativePath);
  }

  return {
    renderedMap: rendered.trim(),
    tokenEstimate: Math.round(rendered.length * approxTokensPerChar),
    totalFilesScanned: filePaths.length,
    topRankedFiles: includedFiles,
  };
}

export const generateRepoMap = buildSemanticRepoMap;
