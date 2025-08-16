import { homedir } from "node:os";
import { join } from "node:path";

export function defaultConfigPath(): string {
  const home = homedir();
  const isWin = process.platform === "win32";
  if (isWin) {
    const appdata = process.env.APPDATA || join(home, "AppData", "Roaming");
    return join(appdata, "openai-responses-mcp", "config.yaml");
  }
  return join(home, ".config", "openai-responses-mcp", "config.yaml");
}

export function resolveConfigPath(cliPath?: string): string | undefined {
  if (cliPath && cliPath.trim()) return cliPath;
  return defaultConfigPath();
}
