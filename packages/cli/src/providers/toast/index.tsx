import { 
  createContext, 
  useContext, 
  useRef, 
  useState, 
  useCallback,
  useEffect
} from "react";
import type { ReactNode } from "react";
import { useTerminalDimensions } from "@opentui/react";
import type { ToastOptions, ToastVariant } from "./types";
import { DEFAULT_DURATION } from "./types";
import { SplitBorderChars } from "../../components/border";
import { useTheme } from "../theme";

export type ToastContextValue = {
  show: (options: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return value;
}

type InternalToast = ToastOptions & {
  count: number;
  remainingMs: number;
  totalMs: number;
};

type ToastProviderProps = {
  children: ReactNode;
};

export function ToastProvider({ children }: ToastProviderProps) {
  const [currentToast, setCurrentToast] = useState<InternalToast | null>(null);
  const timeoutHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalHandleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutHandleRef.current) {
      clearTimeout(timeoutHandleRef.current);
      timeoutHandleRef.current = null;
    }
    if (intervalHandleRef.current) {
      clearInterval(intervalHandleRef.current);
      intervalHandleRef.current = null;
    }
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const duration = options.duration ?? DEFAULT_DURATION;
    clearTimers();

    setCurrentToast((prev) => {
      // If same message, bump the count badge instead of jarring reload
      if (prev && prev.message === options.message) {
        return {
          ...prev,
          variant: options.variant ?? prev.variant ?? "info",
          count: prev.count + 1,
          remainingMs: duration,
          totalMs: duration,
        };
      }
      return {
        variant: options.variant ?? "info",
        ...options,
        count: 1,
        remainingMs: duration,
        totalMs: duration,
      };
    });

    // Tick remainingMs every 100ms for smooth decay bar
    intervalHandleRef.current = setInterval(() => {
      setCurrentToast((prev) => {
        if (!prev) return null;
        const nextRemaining = prev.remainingMs - 100;
        if (nextRemaining <= 0) return null;
        return { ...prev, remainingMs: nextRemaining };
      });
    }, 100);

    timeoutHandleRef.current = setTimeout(() => {
      clearTimers();
      setCurrentToast(null);
    }, duration);
  }, [clearTimers]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const value: ToastContextValue = {
    show,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast currentToast={currentToast} />
    </ToastContext.Provider>
  );
}

type ToastProps = {
  currentToast: InternalToast | null;
};

function Toast({ currentToast }: ToastProps) {
  const { width } = useTerminalDimensions();
  const { colors } = useTheme();

  if (!currentToast) {
    return null;
  }

  const variantColors: Record<ToastVariant, string> = {
    success: colors.success,
    error: colors.error,
    info: colors.info,
  };

  const borderColor = currentToast.variant
    ? variantColors[currentToast.variant]
    : variantColors.info;

  const totalBarWidth = 14;
  const ratio = Math.max(0, Math.min(1, currentToast.remainingMs / currentToast.totalMs));
  const filled = Math.round(ratio * totalBarWidth);
  const decayBar = "━".repeat(filled) + "─".repeat(totalBarWidth - filled);

  return (
    <box
      position="absolute"
      justifyContent="center"
      alignItems="flex-start"
      top={2}
      right={2}
      width={Math.max(1, Math.min(60, width - 6))}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={colors.surface}
      borderColor={borderColor}
      border={["left", "right"]}
      customBorderChars={SplitBorderChars}
    >
      <box flexDirection="column" gap={0} width="100%">
        <box flexDirection="row" justifyContent="space-between" width="100%">
          <text fg="#E1E1E1" wrapMode="word">
            {currentToast.message}
          </text>
          {currentToast.count > 1 && (
            <text fg={borderColor}>
              {" "}[×{currentToast.count}]
            </text>
          )}
        </box>
        <box marginTop={0.5}>
          <text fg={borderColor}>
            {decayBar}
          </text>
        </box>
      </box>
    </box>
  );
}
