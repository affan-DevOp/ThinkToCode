import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type AuthData = {
  token: string;
};

const AUTH_DIR = join(homedir(), ".thinktocode");
const AUTH_FILE = join(AUTH_DIR, "auth.json");

export function getAuth(): AuthData | null {
  try {
    if (!existsSync(AUTH_FILE)) return null;
    const raw = readFileSync(AUTH_FILE, "utf-8");
    return JSON.parse(raw) as AuthData;
  } catch {
    return null;
  }
}

export function saveAuth(data: AuthData) {
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }

  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function clearAuth() {
  try {
    if (existsSync(AUTH_FILE)) {
      unlinkSync(AUTH_FILE);
    }
  } catch {
    // Ignore errors when clearing auth
  }
}
