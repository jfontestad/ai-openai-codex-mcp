import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import os from "node:os";
import type { Config } from "../config/defaults.js";
import { SYSTEM_POLICY } from "./system-policy.js";

function expandHome(p: string): string {
  if (!p) return p;
  if (p.startsWith("~")) return os.homedir() + p.slice(1);
  return p;
}

export function resolveSystemPolicy(cfg: Config): string {
  const setting = cfg.policy?.system;
  if (!setting || setting.source !== "file") return SYSTEM_POLICY;
  const merge = setting.merge || "replace";
  try {
    const filePath = resolve(expandHome(setting.path || ""));
    if (!filePath || !existsSync(filePath)) {
      console.error(`[policy] warn: file not found path=${setting.path}`);
      return SYSTEM_POLICY;
    }
    const raw = readFileSync(filePath, "utf8");
    if (merge === "replace") return raw;
    if (merge === "prepend") return `${raw}\n\n${SYSTEM_POLICY}`;
    // append
    return `${SYSTEM_POLICY}\n\n${raw}`;
  } catch (e: any) {
    try { console.error(`[policy] warn: failed to read policy path=${setting.path} err=${e?.message ?? e}`); } catch {}
    return SYSTEM_POLICY;
  }
}

