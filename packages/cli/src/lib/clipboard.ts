export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (process.platform === "win32") {
      const proc = Bun.spawn(["clip.exe"], { stdin: "pipe" });
      proc.stdin.write(text);
      proc.stdin.end();
      const code = await proc.exited;
      return code === 0;
    }

    if (process.platform === "darwin") {
      const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
      proc.stdin.write(text);
      proc.stdin.end();
      const code = await proc.exited;
      return code === 0;
    }

    // Linux
    try {
      const proc = Bun.spawn(["xclip", "-selection", "clipboard"], { stdin: "pipe" });
      proc.stdin.write(text);
      proc.stdin.end();
      const code = await proc.exited;
      if (code === 0) return true;
    } catch {
      const proc = Bun.spawn(["wl-copy"], { stdin: "pipe" });
      proc.stdin.write(text);
      proc.stdin.end();
      const code = await proc.exited;
      return code === 0;
    }
  } catch {
    return false;
  }

  return false;
}
