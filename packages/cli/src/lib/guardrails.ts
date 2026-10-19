export type DestructiveCheckResult = {
  isDestructive: boolean;
  reason?: string;
};

export function isDestructiveCommand(rawCommand: string): DestructiveCheckResult {
  const cmd = rawCommand.trim();
  if (!cmd) return { isDestructive: false };

  // 1. File or directory deletions (rm, rmdir, del, erase, Remove-Item)
  if (/\b(rm|rmdir)(\.exe)?\s+/i.test(cmd) || /^(rm|rmdir)(\.exe)?$/i.test(cmd)) {
    return { isDestructive: true, reason: "File or directory deletion command (rm / rmdir)" };
  }
  if (/\b(del|erase)(\.exe)?\s+/i.test(cmd) || /^(del|erase)(\.exe)?$/i.test(cmd)) {
    return { isDestructive: true, reason: "File deletion command (del / erase)" };
  }
  if (/\b(Remove-Item|ri)\b/i.test(cmd)) {
    return { isDestructive: true, reason: "PowerShell item deletion command (Remove-Item)" };
  }

  // 2. Database or schema wiping
  if (/\b(drop\s+(database|schema|table|collection)|dropdb|truncate\s+table)\b/i.test(cmd)) {
    return { isDestructive: true, reason: "Database table, schema, or database drop command" };
  }
  if (/\bprisma\s+(migrate\s+reset|db\s+push\s+--force-reset)\b/i.test(cmd)) {
    return { isDestructive: true, reason: "Prisma database reset command" };
  }

  // 3. Disk formatting or block-level writes
  if (/\b(format\s+[a-zA-Z]:|mkfs(\.[a-zA-Z0-9]+)?|dd\s+if=)/i.test(cmd)) {
    return { isDestructive: true, reason: "Disk formatting or direct block overwrite command" };
  }

  // 4. System & Root privilege escalation
  if (/\b(sudo|su\s+-|runas)\b/i.test(cmd)) {
    return { isDestructive: true, reason: "Root or administrator privilege escalation (sudo / su)" };
  }

  // 5. Destructive Git operations (can wipe uncommitted local work)
  if (/\bgit\s+(reset\s+--hard|clean\s+(-[a-zA-Z]*f|--force)|checkout\s+--\s+\.)\b/i.test(cmd)) {
    return { isDestructive: true, reason: "Destructive Git operation that can wipe uncommitted local files" };
  }

  // 6. Extreme permission changes
  if (/\bchmod\s+(-[a-zA-Z]*R\s+)?(777|000)\b/i.test(cmd)) {
    return { isDestructive: true, reason: "Extreme permission change (chmod 777/000)" };
  }

  // 7. System shutdown or killing
  if (/\b(shutdown|reboot|init\s+0)\b/i.test(cmd)) {
    return { isDestructive: true, reason: "System shutdown or reboot command" };
  }

  return { isDestructive: false };
}
