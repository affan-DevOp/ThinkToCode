import { z } from "zod";
import { tool } from "ai";

export const Mode = {
  BUILD: "BUILD",
  PLAN: "PLAN",
} as const;

export const modeSchema = z.enum([Mode.BUILD, Mode.PLAN]);

export type ModeType = (typeof Mode)[keyof typeof Mode];

export const toolInputSchemas = {
  readFile: z.object({
    path: z.string().describe("Relative path to the file to read"),
  }),
  listDirectory: z.object({
    path: z.string().default(".").describe("Relative directory path to list"),
  }),
  glob: z.object({
    pattern: z.string().describe("Glob pattern to match files"),
    path: z.string().default(".").describe("Directory to search from"),
  }),
  grep: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    path: z.string().default(".").describe("Directory to search from"),
    include: z.string().optional().describe("Optional glob for files to include"),
  }),
  writeFile: z.object({
    path: z.string().describe("Relative path to write"),
    content: z.string().describe("File contents"),
  }),
  editFile: z.object({
    path: z.string().describe("Relative path to edit"),
    oldString: z.string().optional().describe("Exact text to replace (for single edit)"),
    newString: z.string().optional().describe("Replacement text (for single edit)"),
    edits: z
      .array(
        z.object({
          oldString: z.string().describe("Exact text hunk to replace"),
          newString: z.string().describe("Replacement text for this hunk"),
        })
      )
      .optional()
      .describe("Optional list of atomic hunks to replace simultaneously"),
  }),
  bash: z.object({
    command: z.string().describe("Shell command to run"),
    description: z.string().optional().describe("Short description of the command"),
    timeout: z.number().optional().describe("Timeout in milliseconds"),
  }),
  patchFile: z.object({
    path: z.string().describe("Relative path to the file to patch"),
    patch: z
      .string()
      .describe(
        "Unified diff containing @@ ... @@ hunks with ' ' (context), '-' (removed), and '+' (added) lines"
      ),
    previewOnly: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, returns the side-by-side diff preview without writing to disk"),
  }),
} as const;

export const readOnlyToolContracts = {
  readFile: tool({
    description: "Read a file from the current project directory.",
    inputSchema: toolInputSchemas.readFile,
  }),
  listDirectory: tool({
    description: "List entries in a directory under the current project directory.",
    inputSchema: toolInputSchemas.listDirectory,
  }),
  glob: tool({
    description: "Find files matching a glob pattern under the current project directory.",
    inputSchema: toolInputSchemas.glob,
  }),
  grep: tool({
    description:
      "Search file contents with a regular expression under the current project directory.",
    inputSchema: toolInputSchemas.grep,
  }),
} as const;

export const buildToolContracts = {
  ...readOnlyToolContracts,
  writeFile: tool({
    description: "Create or overwrite a file under the current project directory.",
    inputSchema: toolInputSchemas.writeFile,
  }),
  editFile: tool({
    description:
      "Replace exact text in a file under the current project directory. Supports both single-hunk replacement (oldString/newString) and atomic multi-hunk replacements (edits: [{ oldString, newString }]).",
    inputSchema: toolInputSchemas.editFile,
  }),
  bash: tool({
    description: "Run a shell command in the current project directory.",
    inputSchema: toolInputSchemas.bash,
  }),
  patchFile: tool({
    description:
      "Apply a Unified Diff patch (with one or more '@@ -start,count +start,count @@' hunks) to an existing file using a 4-tier cascade fuzzy matching engine. Tolerates shifted line numbers, trailing whitespace differences, and block indentation shifts while saving ~70% of output tokens.",
    inputSchema: toolInputSchemas.patchFile,
  }),
} as const;

export type ToolContracts = typeof buildToolContracts;

export function getToolContracts(mode: ModeType) {
  return mode === Mode.PLAN 
    ? readOnlyToolContracts 
    : buildToolContracts;
};
