import { join, normalize } from "node:path";

export interface PathResolutionEnv {
  HOME?: string;
  USERPROFILE?: string;
  CODEX_HOME?: string;
  [key: string]: string | undefined;
}

export const DEFAULT_AUTH_PATH = "~/.codex/auth.json";

function expandEnvSegments(input: string, env: PathResolutionEnv): string {
  return input.replace(/\$(\w+)|\$\{([^}]+)\}/g, (_, simple, braced) => {
    const key = (simple ?? braced) as string;
    const value = env[key];
    return value !== undefined ? value : "";
  });
}

function expandHomePrefix(input: string, env: PathResolutionEnv): string {
  if (!input.startsWith("~")) return input;
  const home = env.HOME || env.USERPROFILE;
  if (!home) return input;
  if (input === "~") return home;
  const trimmed = input.startsWith("~/") ? input.slice(2) : input.slice(1);
  return join(home, trimmed);
}

export function resolveAuthPath(cfg: { authPath: string }, env: PathResolutionEnv): string {
  const preferredRaw = cfg.authPath?.trim() || DEFAULT_AUTH_PATH;
  const hasCustom = preferredRaw !== DEFAULT_AUTH_PATH;

  const basePath = hasCustom
    ? preferredRaw
    : env.CODEX_HOME
      ? join(env.CODEX_HOME, "auth.json")
      : DEFAULT_AUTH_PATH;

  const expanded = expandEnvSegments(basePath, env);
  const withHome = expandHomePrefix(expanded, env);
  return normalize(withHome);
}
