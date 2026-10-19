import { useCallback, useEffect, useRef } from "react";
import { useDialog } from "../../providers/dialog";
import { useTheme } from "../../providers/theme";
import { DialogSearchList } from "../dialog-search-list";
import { THEMES } from "../../theme";
import type { Theme } from "../../theme";

export const ThemeDialogContent = () => {
  const dialog = useDialog();
  const { setTheme, previewTheme, revertTheme, currentTheme } = useTheme();
  const originalThemeRef = useRef(currentTheme);
  const confirmedRef = useRef(false);

  // Revert to original theme if dismissed without confirming (e.g. Esc)
  useEffect(() => {
    return () => {
      if (!confirmedRef.current) {
        revertTheme();
      }
    };
  }, [revertTheme]);

  const handleSelect = useCallback(
    (theme: Theme) => {
      confirmedRef.current = true;
      setTheme(theme);
      dialog.close();
    },
    [setTheme, dialog],
  );

  const handleHighlight = useCallback(
    (theme: Theme) => {
      previewTheme(theme);
    },
    [previewTheme],
  );

  return (
    <DialogSearchList
      items={THEMES}
      onSelect={handleSelect}
      onHighlight={handleHighlight}
      renderItem={(theme, isSelected) => (
        <text selectable={false} fg={isSelected ? "black" : "white"}>
          {theme.name === originalThemeRef.current.name
            ? "\u0020\u2022\u0020"
            : "\u0020\u0020\u0020"}
          {theme.name}
        </text>
      )}
      getKey={(t) => t.name}
      placeholder="Search themes"
      emptyText="No matching themes"
    />
  );
};
