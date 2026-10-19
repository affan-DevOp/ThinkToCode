import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { ThemeColors, Theme } from "../../theme";
import { DEFAULT_THEME, THEMES } from "../../theme";

const CONFIG_DIR = join(homedir(), ".thinktocode");
const THEME_PREFERENCES_PATH = join(CONFIG_DIR, "preferences.json");

type ThemePreferences = {
  themeName: string;
};

function getInitialTheme(): Theme {
  try {
    const preferences = JSON.parse(
      readFileSync(THEME_PREFERENCES_PATH, "utf8"),
    ) as Partial<ThemePreferences>;
    const savedTheme = THEMES.find((theme) => theme.name === preferences.themeName);
    return savedTheme ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function persistThemeAtomically(theme: Theme) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    const tmpPath = `${THEME_PREFERENCES_PATH}.tmp`;
    writeFileSync(
      tmpPath,
      JSON.stringify({ themeName: theme.name } satisfies ThemePreferences, null, 2),
      "utf8",
    );
    renameSync(tmpPath, THEME_PREFERENCES_PATH);
  } catch {
    // Ignore preference write failures so theme switching still works in session
  }
}

type ThemeContextValue = {
  colors: ThemeColors;
  currentTheme: Theme;
  setTheme: (theme: Theme) => void;
  previewTheme: (theme: Theme) => void;
  revertTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return value;
}

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [committedTheme, setCommittedTheme] = useState<Theme>(getInitialTheme);
  const [currentTheme, setCurrentTheme] = useState<Theme>(committedTheme);
  const committedRef = useRef(committedTheme);
  committedRef.current = committedTheme;

  // Live preview without disk I/O
  const previewTheme = useCallback((theme: Theme) => {
    setCurrentTheme(theme);
  }, []);

  // Revert preview back to saved theme
  const revertTheme = useCallback(() => {
    setCurrentTheme(committedRef.current);
  }, []);

  // Confirm and persist to disk atomically
  const setTheme = useCallback((theme: Theme) => {
    setCommittedTheme(theme);
    setCurrentTheme(theme);
    persistThemeAtomically(theme);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        colors: currentTheme.colors,
        currentTheme,
        setTheme,
        previewTheme,
        revertTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
