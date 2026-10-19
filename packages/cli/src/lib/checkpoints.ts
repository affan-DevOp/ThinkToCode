import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, relative } from "node:path";

export type FileSnapshot = {
  path: string;
  relativePath: string;
  existedBefore: boolean;
  previousContent: string | null;
};

export type Checkpoint = {
  id: string;
  timestamp: number;
  description?: string;
  files: Map<string, FileSnapshot>;
};

export type UndoResult = {
  success: boolean;
  message: string;
  fileCount: number;
  revertedFiles: string[];
};

class CheckpointManager {
  private checkpoints: Checkpoint[] = [];
  private currentTurnCheckpoint: Checkpoint | null = null;
  private maxCheckpoints = 30;

  /**
   * Starts a new checkpoint container for an incoming agent turn.
   */
  beginTurn(description?: string): string {
    const id = `ckpt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.currentTurnCheckpoint = {
      id,
      timestamp: Date.now(),
      description,
      files: new Map(),
    };
    return id;
  }

  /**
   * Automatically captures the file state BEFORE any tool modifies it.
   */
  captureFileBeforeMutation(absolutePath: string, relativePath?: string): void {
    if (!this.currentTurnCheckpoint) {
      this.beginTurn();
    }

    const checkpoint = this.currentTurnCheckpoint!;
    // Only capture the initial state for each file once per turn
    if (checkpoint.files.has(absolutePath)) {
      return;
    }

    const rel = relativePath ?? relative(process.cwd(), absolutePath);

    if (existsSync(absolutePath)) {
      try {
        const content = readFileSync(absolutePath, "utf-8");
        checkpoint.files.set(absolutePath, {
          path: absolutePath,
          relativePath: rel,
          existedBefore: true,
          previousContent: content,
        });
      } catch {
        // If unreadable, skip
      }
    } else {
      checkpoint.files.set(absolutePath, {
        path: absolutePath,
        relativePath: rel,
        existedBefore: false,
        previousContent: null,
      });
    }
  }

  /**
   * Finalizes the current turn and commits the checkpoint to the undo stack.
   */
  commitTurn(): void {
    if (this.currentTurnCheckpoint && this.currentTurnCheckpoint.files.size > 0) {
      this.checkpoints.push(this.currentTurnCheckpoint);
      if (this.checkpoints.length > this.maxCheckpoints) {
        this.checkpoints.shift();
      }
    }
    this.currentTurnCheckpoint = null;
  }

  /**
   * Rolls back the last checkpoint on the undo stack.
   */
  undo(): UndoResult {
    // If there is an active uncommitted turn with file changes, undo that first
    let target = this.currentTurnCheckpoint && this.currentTurnCheckpoint.files.size > 0
      ? this.currentTurnCheckpoint
      : this.checkpoints.pop();

    this.currentTurnCheckpoint = null;

    if (!target || target.files.size === 0) {
      return {
        success: false,
        message: "No recent file changes to undo.",
        fileCount: 0,
        revertedFiles: [],
      };
    }

    const revertedFiles: string[] = [];

    for (const [filePath, snapshot] of target.files.entries()) {
      try {
        if (snapshot.existedBefore && snapshot.previousContent !== null) {
          const dir = dirname(filePath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(filePath, snapshot.previousContent, "utf-8");
          revertedFiles.push(snapshot.relativePath);
        } else if (!snapshot.existedBefore) {
          if (existsSync(filePath)) {
            unlinkSync(filePath);
            revertedFiles.push(`${snapshot.relativePath} (deleted)`);
          }
        }
      } catch (err) {
        console.error(`Failed to revert file ${filePath}:`, err);
      }
    }

    return {
      success: true,
      message: `Reverted ${revertedFiles.length} file(s)`,
      fileCount: revertedFiles.length,
      revertedFiles,
    };
  }

  get historyDepth(): number {
    return this.checkpoints.length + (this.currentTurnCheckpoint?.files.size ? 1 : 0);
  }

  clear(): void {
    this.checkpoints = [];
    this.currentTurnCheckpoint = null;
  }
}

export const checkpointManager = new CheckpointManager();