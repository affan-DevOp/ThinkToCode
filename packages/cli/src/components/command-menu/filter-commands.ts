import type { Command } from "./types";
import { COMMANDS } from "./commands";
import { fuzzyMatch } from "../../lib/fuzzy";

export function getFilteredCommands(query: string): Command[] {
  if (query.length === 0) return COMMANDS;
  return COMMANDS
    .map((cmd) => ({ cmd, match: fuzzyMatch(query, cmd.name) }))
    .filter(({ match }) => match.matched)
    .sort((a, b) => b.match.score - a.match.score)
    .map(({ cmd }) => cmd);
}
