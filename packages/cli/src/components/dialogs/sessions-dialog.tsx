import { useCallback, useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { format } from "date-fns";
import { useNavigate } from "react-router";
import { useDialog } from "../../providers/dialog";
import { useToast } from "../../providers/toast";
import { useTheme } from "../../providers/theme";
import { apiClient } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/http-errors";
import { DialogSearchList } from "../dialog-search-list";
import { EmptyBorder } from "../border";
import type { InferResponseType } from "hono/client";

type Session = InferResponseType<(typeof apiClient.sessions)["$get"], 200>[number];

function truncateTitle(title: string, maxLength = 28): string {
  const trimmed = title.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength - 1) + "…";
}

export const SessionsDialogContent = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { close } = useDialog();
  const navigate = useNavigate();
  const { show } = useToast();
  const { colors } = useTheme();

  useEffect(() => {
    let ignore = false;

    const fetchSessions = async () => {
      try {
        const res = await apiClient.sessions.$get();
        if (!res.ok) {
          throw new Error(await getErrorMessage(res));
        }

        const data = await res.json();

        if (!ignore) {
          setSessions(data);
          setLoading(false);
        }
      } catch (error) {
        if (!ignore) {
          show({
            variant: "error",
            message: error instanceof Error ? error.message : "Failed to fetch sessions",
          });
          close();
        }
      }
    };

    fetchSessions();

    return () => {
      ignore = true;
    };
  }, [close, show]);

  const handleSelect = useCallback(
    (session: Session) => {
      close();
      navigate(`/sessions/${session.id}`);
    },
    [close, navigate],
  );

  const handleDelete = useCallback(
    async (session: Session) => {
      if (deletingId) return;
      setDeletingId(session.id);

      // Optimistically remove from list immediately
      setSessions((prev) => prev.filter((s) => s.id !== session.id));

      try {
        const res = await apiClient.sessions[":id"].$delete({
          param: { id: session.id },
        });

        if (!res.ok) {
          throw new Error(await getErrorMessage(res));
        }

        show({
          variant: "success",
          message: `Deleted session: "${session.title}"`,
        });
      } catch (error) {
        // Rollback on failure
        setSessions((prev) => [session, ...prev]);
        show({
          variant: "error",
          message: error instanceof Error ? error.message : "Failed to delete session",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, show],
  );

  if (loading) {
    return (
      <box flexDirection="column">
        <text attributes={TextAttributes.DIM}>Loading sessions...</text>
      </box>
    );
  }

  return (
    <DialogSearchList
      items={sessions}
      onSelect={handleSelect}
      onDelete={handleDelete}
      filterFn={(s, query) => s.title.toLowerCase().includes(query.toLowerCase())}
      renderItem={(session, isSelected) => (
        <box flexDirection="row" width="100%" height={1} alignItems="center" paddingRight={1}>
          {/* Title column: strictly bounded with ellipsis to ensure alignment */}
          <box flexGrow={1} flexShrink={1} overflow="hidden">
            <text selectable={false} fg={isSelected ? "black" : "white"}>
              {truncateTitle(session.title, 28)}
            </text>
          </box>

          {/* Fixed right-aligned timestamp and delete button column */}
          <box flexShrink={0} flexDirection="row" alignItems="center">
            {/* Timestamp: fixed width of 9 so all timestamps align */}
            <box width={9} justifyContent="flex-end" alignItems="center">
              <text
                selectable={false}
                fg={isSelected ? "black" : undefined}
                attributes={TextAttributes.DIM}
              >
                {format(new Date(session.createdAt), "hh:mm a")}
              </text>
            </box>

            {/* Delete button: fixed width of 3 so all ✕ are strictly on the exact same line */}
            <box
              width={3}
              justifyContent="center"
              alignItems="center"
              onMouseDown={(e) => {
                e.stopPropagation();
                void handleDelete(session);
              }}
            >
              <text fg={isSelected ? "black" : colors.error} attributes={TextAttributes.BOLD}>
                ✕
              </text>
            </box>
          </box>
        </box>
      )}
      getKey={(s) => s.id}
      placeholder="Search sessions"
      emptyText="No matching sessions"
      footer={
        <box
          border={["top"]}
          borderColor={colors.thinkingBorder}
          customBorderChars={{
            ...EmptyBorder,
            horizontal: "─",
          }}
          paddingTop={1}
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          width="100%"
        >
          <box flexDirection="row" gap={2} alignItems="center">
            <box flexDirection="row" gap={1} alignItems="center">
              <text fg={colors.primary}>enter</text>
              <text attributes={TextAttributes.DIM}>open</text>
            </box>
            <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>•</text>
            <box flexDirection="row" gap={1} alignItems="center">
              <text fg={colors.error}>del</text>
              <text attributes={TextAttributes.DIM}>delete</text>
            </box>
          </box>

          <box flexDirection="row" gap={1} alignItems="center">
            <text fg={colors.dimSeparator}>esc</text>
            <text attributes={TextAttributes.DIM}>close</text>
          </box>
        </box>
      }
    />
  );
};
