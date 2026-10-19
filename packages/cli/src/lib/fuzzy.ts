export interface FuzzyMatchResult {
  matched: boolean;
  score: number;
  indices: number[];
}

export function fuzzyMatch(query: string, target: string): FuzzyMatchResult {
  if (!query.trim()) return { matched: true, score: 0, indices: [] };
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  const indices: number[] = [];
  let qIdx = 0;
  let score = 0;
  let prevMatchIdx = -2;

  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
    if (t[tIdx] === q[qIdx]) {
      indices.push(tIdx);
      if (tIdx === prevMatchIdx + 1) score += 15; // Consecutive char bonus
      if (tIdx === 0 || [" ", "-", "_", "/"].includes(t[tIdx - 1]!)) score += 20; // Word-start bonus
      else score += 5;
      prevMatchIdx = tIdx;
      qIdx++;
    }
  }

  if (qIdx !== q.length) return { matched: false, score: -1, indices: [] };
  score -= (target.length - q.length) * 0.5;
  return { matched: true, score, indices };
}

export function splitHighlightedSegments(
  text: string,
  indices: number[]
): Array<{ text: string; highlighted: boolean }> {
  if (indices.length === 0) return [{ text, highlighted: false }];
  const indexSet = new Set(indices);
  const segments: Array<{ text: string; highlighted: boolean }> = [];

  for (let i = 0; i < text.length; i++) {
    const isHit = indexSet.has(i);
    const last = segments[segments.length - 1];
    if (last && last.highlighted === isHit) {
      last.text += text[i]!;
    } else {
      segments.push({ text: text[i]!, highlighted: isHit });
    }
  }
  return segments;
}
