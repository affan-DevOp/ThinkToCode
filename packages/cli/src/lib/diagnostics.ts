import { extname } from "node:path";

export type FileDiagnostic = {
  valid: boolean;
  warning?: string;
  error?: string;
  executionMs: number;
};

/**
 * Ultra-fast (<1ms) post-edit syntax diagnostic validator powered by native Bun.Transpiler.
 */
export function checkFileDiagnostics(filePath: string, content: string): FileDiagnostic | null {
  const ext = extname(filePath).toLowerCase();
  const start = performance.now();

  try {
    if (ext === ".json") {
      JSON.parse(content);
      return { valid: true, executionMs: Number((performance.now() - start).toFixed(2)) };
    }

    if (
      ext === ".ts" ||
      ext === ".tsx" ||
      ext === ".js" ||
      ext === ".jsx" ||
      ext === ".mjs" ||
      ext === ".cjs"
    ) {
      const loader = ext.includes("ts")
        ? ext.includes("x")
          ? "tsx"
          : "ts"
        : ext.includes("x")
          ? "jsx"
          : "js";

      const transpiler = new Bun.Transpiler({ loader });
      transpiler.transformSync(content);
      return { valid: true, executionMs: Number((performance.now() - start).toFixed(2)) };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      warning:
        "Post-edit syntax diagnostic detected an issue in the modified file. Please review and resolve if unintended.",
      error: errorMsg,
      executionMs: Number((performance.now() - start).toFixed(2)),
    };
  }

  return null;
}
