import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { 
  DEFAULT_CHAT_MODEL_ID, 
  Mode, 
  type ModeType, 
  type SupportedChatModelId 
} from "@thinktocode/shared";

export type Preferences = {
  modeModels: Record<ModeType, SupportedChatModelId>;
};

const PREFS_DIR = join(homedir(), ".thinktocode");
const PREFS_FILE = join(PREFS_DIR, "preferences.json");

const DEFAULT_PREFERENCES: Preferences = {
  modeModels: {
    [Mode.PLAN]: "gemini-flash-latest",
    [Mode.BUILD]: DEFAULT_CHAT_MODEL_ID,
  },
};

export function getPreferences(): Preferences {
  try {
    if (!existsSync(PREFS_FILE)) {
      return DEFAULT_PREFERENCES;
    }
    const raw = readFileSync(PREFS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      modeModels: {
        [Mode.PLAN]: parsed?.modeModels?.[Mode.PLAN] ?? DEFAULT_PREFERENCES.modeModels[Mode.PLAN],
        [Mode.BUILD]: parsed?.modeModels?.[Mode.BUILD] ?? DEFAULT_PREFERENCES.modeModels[Mode.BUILD],
      },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    if (!existsSync(PREFS_DIR)) {
      mkdirSync(PREFS_DIR, { recursive: true });
    }
    writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save preferences:", err);
  }
}

export function getStickyModelForMode(mode: ModeType): SupportedChatModelId {
  const prefs = getPreferences();
  return prefs.modeModels[mode] ?? DEFAULT_CHAT_MODEL_ID;
}

export function setStickyModelForMode(mode: ModeType, model: SupportedChatModelId): void {
  const prefs = getPreferences();
  prefs.modeModels[mode] = model;
  savePreferences(prefs);
}
