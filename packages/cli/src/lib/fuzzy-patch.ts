// ============================================================================
// 1. UNIFIED DIFF DATA STRUCTURES & PARSER
// ============================================================================

export type HunkLineType = "context" | "del" | "add";

export interface HunkLine {
  type: HunkLineType;
  content: string;
}

export interface ParsedHunk {
  header: string;
  oldStart: number; // 1-indexed expected start line (defaults to 1 if omitted)
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: HunkLine[];
}

export type MatchStrategy =
  | "exact-offset"
  | "exact-global"
  | "whitespace-normalized"
  | "indent-shifted"
  | "fuzzy-levenshtein";

export interface HunkMatchLocation {
  startIndex: number; // 0-indexed line in target file
  endIndex: number;   // 0-indexed exclusive end line in target file
  strategy: MatchStrategy;
  confidence: number; // 0.0 -> 1.0
  indentDelta: number; // Spaces to shift replacement lines so block indentation stays intact
}

export interface AppliedHunkReport {
  hunkIndex: number;
  header: string;
  strategy: MatchStrategy;
  confidence: number;
  appliedAtLine: number; // 1-indexed
  linesRemoved: number;
  linesAdded: number;
}

/**
 * Parses a standard or LLM-simplified Unified Diff string into structured ParsedHunk[].
 */
export function parseUnifiedDiff(diffText: string): ParsedHunk[] {
  const rawLines = diffText.replace(/\r\n/g, "\n").split("\n");
  const hunks: ParsedHunk[] = [];
  let current: ParsedHunk | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;

    // Ignore markdown code fences if the LLM wrapped the diff
    if (line.startsWith("```")) continue;
    // Ignore file header lines
    if (
      (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("diff --git")) &&
      !current
    ) {
      continue;
    }

    const stdMatch = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@(.*)$/);
    const simpMatch = !stdMatch ? line.match(/^@@\s*(?:.*?)@@(.*)$/) : null;

    if (stdMatch || simpMatch) {
      finalizeHunk(current);
      current = {
        header: line,
        oldStart: stdMatch && stdMatch[1] ? parseInt(stdMatch[1], 10) : 1,
        oldLines: stdMatch && stdMatch[2] ? parseInt(stdMatch[2], 10) : 0,
        newStart: stdMatch && stdMatch[3] ? parseInt(stdMatch[3], 10) : 1,
        newLines: stdMatch && stdMatch[4] ? parseInt(stdMatch[4], 10) : 0,
        lines: [],
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.lines.push({ type: "add", content: line.slice(1) });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.lines.push({ type: "del", content: line.slice(1) });
    } else if (line.startsWith(" ")) {
      current.lines.push({
        type: "context",
        content: line.slice(1),
      });
    } else if (line.startsWith("\\ No newline at end of file") || line === "") {
      continue;
    } else {
      // Tolerate unprefixed context lines inside a hunk (common LLM quirk)
      current.lines.push({ type: "context", content: line });
    }
  }

  function finalizeHunk(h: ParsedHunk | null) {
    if (!h) return;
    while (
      h.lines.length > 0 &&
      h.lines[h.lines.length - 1]!.type === "context" &&
      h.lines[h.lines.length - 1]!.content.trim() === ""
    ) {
      h.lines.pop();
    }
    if (h.lines.length > 0) {
      hunks.push(h);
    }
  }

  finalizeHunk(current);

  return hunks;
}

// ============================================================================
// 2. STRING NORMALIZATION & LEVENSHTEIN SIMILARITY ENGINE
// ============================================================================

export function normalizeWhitespace(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

export function getLeadingSpaces(line: string): number {
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === " ") count += 1;
    else if (line[i] === "\t") count += 2;
    else break;
  }
  return count;
}

/**
 * Space-efficient O(min(M, N)) Levenshtein edit distance + normalized similarity in [0, 1].
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const s1 = a.trim();
  const s2 = b.trim();
  if (s1 === s2) return 1.0;
  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;

  // Quick length-bound pruning
  if (Math.abs(len1 - len2) / maxLen > 0.4) {
    return 0.0;
  }

  let prevRow = new Uint16Array(len2 + 1);
  let currRow = new Uint16Array(len2 + 1);
  for (let j = 0; j <= len2; j++) prevRow[j] = j;

  for (let i = 1; i <= len1; i++) {
    currRow[0] = i;
    const ch1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= len2; j++) {
      const cost = ch1 === s2.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j]! + 1,
        currRow[j - 1]! + 1,
        prevRow[j - 1]! + cost
      );
    }
    const tmp = prevRow;
    prevRow = currRow;
    currRow = tmp;
  }

  const distance = prevRow[len2]!;
  return 1.0 - distance / maxLen;
}

// ============================================================================
// 3. 4-TIER CASCADE FUZZY HUNK LOCATOR
// ============================================================================

/**
 * Locates where a hunk's old lines occur in fileLines using a 4-tier cascade:
 *   Tier 1: Exact match near expectedLine (or globally if line numbers shifted)
 *   Tier 2: Whitespace-normalized match
 *   Tier 3: Relative indentation-shifted match (computes indentDelta)
 *   Tier 4: Sliding-window Levenshtein fuzzy match (>= 0.85 similarity)
 */
export function locateHunkFuzzy(
  fileLines: string[],
  oldBlock: string[],
  expectedStartLine = 1,
  minStartingLine = 0,
  fuzzyThreshold = 0.85
): HunkMatchLocation | null {
  const M = oldBlock.length;
  const N = fileLines.length;
  if (M === 0) {
    const idx = Math.max(0, Math.min(N, expectedStartLine - 1));
    return {
      startIndex: idx,
      endIndex: idx,
      strategy: "exact-offset",
      confidence: 1.0,
      indentDelta: 0,
    };
  }
  if (M > N) return null;

  const expectedIdx = Math.max(minStartingLine, Math.min(N - M, expectedStartLine - 1));

  // Order candidate indices radially outward from expectedIdx
  const candidateOrder: number[] = [];
  for (let delta = 0; delta <= N; delta++) {
    const left = expectedIdx - delta;
    const right = expectedIdx + delta;
    if (left >= minStartingLine && left <= N - M) candidateOrder.push(left);
    if (delta > 0 && right >= minStartingLine && right <= N - M) candidateOrder.push(right);
  }

  // TIER 1: Exact line-by-line match
  for (const idx of candidateOrder) {
    let exact = true;
    for (let k = 0; k < M; k++) {
      if (fileLines[idx + k] !== oldBlock[k]) {
        exact = false;
        break;
      }
    }
    if (exact) {
      return {
        startIndex: idx,
        endIndex: idx + M,
        strategy: Math.abs(idx - expectedIdx) <= 3 ? "exact-offset" : "exact-global",
        confidence: 1.0,
        indentDelta: 0,
      };
    }
  }

  // TIER 2 & TIER 3: Whitespace-Normalized & Relative Indentation Shift Match
  const normOld = oldBlock.map(normalizeWhitespace);
  for (const idx of candidateOrder) {
    let normMatch = true;
    for (let k = 0; k < M; k++) {
      if (normalizeWhitespace(fileLines[idx + k]!) !== normOld[k]) {
        normMatch = false;
        break;
      }
    }
    if (normMatch) {
      const deltas: number[] = [];
      for (let k = 0; k < M; k++) {
        if (oldBlock[k]!.trim().length > 0 && fileLines[idx + k]!.trim().length > 0) {
          deltas.push(getLeadingSpaces(fileLines[idx + k]!) - getLeadingSpaces(oldBlock[k]!));
        }
      }
      deltas.sort((a, b) => a - b);
      const medianDelta = deltas.length > 0 ? deltas[Math.floor(deltas.length / 2)]! : 0;

      const isPureIndentShift =
        medianDelta !== 0 && deltas.every((d) => d === medianDelta);

      return {
        startIndex: idx,
        endIndex: idx + M,
        strategy: isPureIndentShift ? "indent-shifted" : "whitespace-normalized",
        confidence: isPureIndentShift ? 0.98 : 0.95,
        indentDelta: medianDelta,
      };
    }
  }

  // TIER 4: Sliding-Window Levenshtein Similarity Match
  let bestIdx = -1;
  let bestScore = -1;
  let secondBestScore = -1;

  for (const idx of candidateOrder) {
    let sumSim = 0;
    let aborted = false;

    for (let k = 0; k < M; k++) {
      const sim = levenshteinSimilarity(fileLines[idx + k]!, oldBlock[k]!);
      if (oldBlock[k]!.trim().length > 0 && sim < 0.70) {
        aborted = true;
        break;
      }
      sumSim += sim;
    }

    if (aborted) continue;

    const proximityBonus = Math.max(0, 0.01 * (1 - Math.abs(idx - expectedIdx) / Math.max(1, N)));
    const avgSim = sumSim / M + proximityBonus;

    if (avgSim > bestScore) {
      secondBestScore = bestScore;
      bestScore = avgSim;
      bestIdx = idx;
    } else if (avgSim > secondBestScore) {
      secondBestScore = avgSim;
    }
  }

  if (bestIdx !== -1 && bestScore >= fuzzyThreshold) {
    if (secondBestScore >= fuzzyThreshold && bestScore - secondBestScore < 0.015) {
      return null;
    }

    const deltas: number[] = [];
    for (let k = 0; k < M; k++) {
      if (oldBlock[k]!.trim().length > 0 && fileLines[bestIdx + k]!.trim().length > 0) {
        deltas.push(getLeadingSpaces(fileLines[bestIdx + k]!) - getLeadingSpaces(oldBlock[k]!));
      }
    }
    deltas.sort((a, b) => a - b);
    const medianDelta = deltas.length > 0 ? deltas[Math.floor(deltas.length / 2)]! : 0;

    return {
      startIndex: bestIdx,
      endIndex: bestIdx + M,
      strategy: "fuzzy-levenshtein",
      confidence: Number(Math.min(0.99, bestScore).toFixed(3)),
      indentDelta: medianDelta,
    };
  }

  return null;
}

export function applyIndentShift(line: string, indentDelta: number): string {
  if (indentDelta === 0 || line.trim().length === 0) return line;
  if (indentDelta > 0) {
    return " ".repeat(indentDelta) + line;
  }
  const removeCount = Math.min(getLeadingSpaces(line), Math.abs(indentDelta));
  return line.slice(removeCount);
}

// ============================================================================
// 4. UNIFIED DIFF PATCH APPLICATOR
// ============================================================================

export interface FuzzyPatchResult {
  success: boolean;
  patchedContent?: string;
  appliedHunks: AppliedHunkReport[];
  failedHunk?: {
    hunkIndex: number;
    header: string;
    reason: string;
  };
  sideBySidePreview?: SideBySideDiffPreview;
}

/**
 * Applies a multi-hunk Unified Diff to originalContent using the 4-tier cascade matcher.
 * Transactional: if any hunk fails to locate, file is left untouched.
 */
export function applyFuzzyUnifiedDiff(
  originalContent: string,
  diffText: string,
  fuzzyThreshold = 0.85
): FuzzyPatchResult {
  const usesCrLf = originalContent.includes("\r\n");
  const workingLines = originalContent.replace(/\r\n/g, "\n").split("\n");
  const hunks = parseUnifiedDiff(diffText);

  if (hunks.length === 0) {
    return {
      success: false,
      appliedHunks: [],
      failedHunk: {
        hunkIndex: 0,
        header: "@@ ... @@",
        reason: "No valid unified diff hunks (@@ ... @@) found in patch.",
      },
    };
  }

  const appliedHunks: AppliedHunkReport[] = [];
  let minSearchLine = 0;
  let cumulativeLineOffset = 0;

  for (let hIdx = 0; hIdx < hunks.length; hIdx++) {
    const hunk = hunks[hIdx]!;
    const oldBlock = hunk.lines
      .filter((l) => l.type === "context" || l.type === "del")
      .map((l) => l.content);

    const expectedStart = Math.max(1, hunk.oldStart + cumulativeLineOffset);
    const match = locateHunkFuzzy(
      workingLines,
      oldBlock,
      expectedStart,
      minSearchLine,
      fuzzyThreshold
    );

    if (!match) {
      return {
        success: false,
        appliedHunks,
        failedHunk: {
          hunkIndex: hIdx + 1,
          header: hunk.header,
          reason: `Could not locate hunk #${hIdx + 1} (${hunk.header}) with exact, whitespace, indentation, or fuzzy matching.`,
        },
      };
    }

    const replacementLines: string[] = [];
    let oldCursor = match.startIndex;

    for (const hLine of hunk.lines) {
      if (hLine.type === "context") {
        replacementLines.push(workingLines[oldCursor] ?? hLine.content);
        oldCursor++;
      } else if (hLine.type === "del") {
        oldCursor++;
      } else if (hLine.type === "add") {
        replacementLines.push(applyIndentShift(hLine.content, match.indentDelta));
      }
    }

    const removedCount = hunk.lines.filter((l) => l.type === "del").length;
    const addedCount = hunk.lines.filter((l) => l.type === "add").length;

    workingLines.splice(match.startIndex, oldBlock.length, ...replacementLines);

    appliedHunks.push({
      hunkIndex: hIdx + 1,
      header: hunk.header,
      strategy: match.strategy,
      confidence: match.confidence,
      appliedAtLine: match.startIndex + 1,
      linesRemoved: removedCount,
      linesAdded: addedCount,
    });

    minSearchLine = match.startIndex + replacementLines.length;
    cumulativeLineOffset += replacementLines.length - oldBlock.length;
  }

  const updatedLf = workingLines.join("\n");
  const patchedContent = usesCrLf ? updatedLf.replace(/\n/g, "\r\n") : updatedLf;
  const sideBySidePreview = buildSideBySidePreview(
    originalContent.replace(/\r\n/g, "\n"),
    updatedLf
  );

  return {
    success: true,
    patchedContent,
    appliedHunks,
    sideBySidePreview,
  };
}

// ============================================================================
// 5. MYERS DIFF & OPENTUI SIDE-BY-SIDE SPLIT DIFF PREVIEW ENGINE
// ============================================================================

export interface SideBySideRow {
  leftLineNum: number | null;
  leftText: string;
  leftType: "context" | "del" | "empty";
  rightLineNum: number | null;
  rightText: string;
  rightType: "context" | "add" | "empty";
}

export interface SideBySideDiffPreview {
  rows: SideBySideRow[];
  additions: number;
  deletions: number;
  ansiSplitString: string;
}

/**
 * Computes a line-level Myers / LCS diff between oldText and newText and aligns
 * deletions (left) and additions (right) side-by-side for OpenTUI.
 */
export function buildSideBySidePreview(
  oldText: string,
  newText: string,
  columnWidth = 44
): SideBySideDiffPreview {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const midOld = oldLines.slice(prefix, oldLines.length - suffix);
  const midNew = newLines.slice(prefix, newLines.length - suffix);

  const M = midOld.length;
  const N = midNew.length;
  const dp = Array.from({ length: M + 1 }, () => new Uint16Array(N + 1));

  for (let i = M - 1; i >= 0; i--) {
    for (let j = N - 1; j >= 0; j--) {
      if (midOld[i] === midNew[j]) {
        dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  type DiffOp = { type: "eq" | "del" | "add"; text: string; oldNo?: number; newNo?: number };
  const ops: DiffOp[] = [];

  const contextStart = Math.max(0, prefix - 3);
  for (let idx = contextStart; idx < prefix; idx++) {
    ops.push({ type: "eq", text: oldLines[idx]!, oldNo: idx + 1, newNo: idx + 1 });
  }

  let i = 0;
  let j = 0;
  while (i < M && j < N) {
    if (midOld[i] === midNew[j]) {
      ops.push({
        type: "eq",
        text: midOld[i]!,
        oldNo: prefix + i + 1,
        newNo: prefix + j + 1,
      });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "del", text: midOld[i]!, oldNo: prefix + i + 1 });
      i++;
    } else {
      ops.push({ type: "add", text: midNew[j]!, newNo: prefix + j + 1 });
      j++;
    }
  }
  while (i < M) {
    ops.push({ type: "del", text: midOld[i]!, oldNo: prefix + i + 1 });
    i++;
  }
  while (j < N) {
    ops.push({ type: "add", text: midNew[j]!, newNo: prefix + j + 1 });
    j++;
  }

  const suffixEnd = Math.min(suffix, 3);
  for (let k = 0; k < suffixEnd; k++) {
    const oldIdx = oldLines.length - suffix + k;
    const newIdx = newLines.length - suffix + k;
    ops.push({ type: "eq", text: oldLines[oldIdx]!, oldNo: oldIdx + 1, newNo: newIdx + 1 });
  }

  const rows: SideBySideRow[] = [];
  let additions = 0;
  let deletions = 0;

  let cursor = 0;
  while (cursor < ops.length) {
    const op = ops[cursor]!;
    if (op.type === "eq") {
      rows.push({
        leftLineNum: op.oldNo ?? null,
        leftText: op.text,
        leftType: "context",
        rightLineNum: op.newNo ?? null,
        rightText: op.text,
        rightType: "context",
      });
      cursor++;
      continue;
    }

    const delBlock: DiffOp[] = [];
    const addBlock: DiffOp[] = [];
    while (cursor < ops.length && ops[cursor]!.type !== "eq") {
      if (ops[cursor]!.type === "del") {
        delBlock.push(ops[cursor]!);
        deletions++;
      } else {
        addBlock.push(ops[cursor]!);
        additions++;
      }
      cursor++;
    }

    const maxPair = Math.max(delBlock.length, addBlock.length);
    for (let p = 0; p < maxPair; p++) {
      const d = delBlock[p];
      const a = addBlock[p];
      rows.push({
        leftLineNum: d?.oldNo ?? null,
        leftText: d?.text ?? "",
        leftType: d ? "del" : "empty",
        rightLineNum: a?.newNo ?? null,
        rightText: a?.text ?? "",
        rightType: a ? "add" : "empty",
      });
    }
  }

  const fitCol = (str: string, width: number) =>
    str.length > width ? str.slice(0, width - 1) + "…" : str.padEnd(width, " ");

  const ansiLines = rows.map((r) => {
    const lNo = r.leftLineNum !== null ? String(r.leftLineNum).padStart(4, " ") : "    ";
    const rNo = r.rightLineNum !== null ? String(r.rightLineNum).padStart(4, " ") : "    ";
    const lMark = r.leftType === "del" ? "-" : " ";
    const rMark = r.rightType === "add" ? "+" : " ";
    const leftCell = `${lNo} ${lMark} ${fitCol(r.leftText, columnWidth)}`;
    const rightCell = `${rNo} ${rMark} ${fitCol(r.rightText, columnWidth)}`;
    return `${leftCell} │ ${rightCell}`;
  });

  return {
    rows,
    additions,
    deletions,
    ansiSplitString: ansiLines.join("\n"),
  };
}
