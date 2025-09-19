import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";
import { defaults, Config } from "./defaults.js";

type PartialDeep<T> = { [K in keyof T]?: T[K] extends object ? PartialDeep<T[K]> : T[K] };

function deepMerge<T extends object>(base: T, override: PartialDeep<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const [k, v] of Object.entries(override as any)) {
    if (v === undefined) continue;
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof (out as any)[k] === "object" &&
      !Array.isArray((out as any)[k])
    ) {
      (out as any)[k] = deepMerge((out as any)[k], v as any);
    } else {
      (out as any)[k] = v;
    }
  }
  return out;
}

export interface LoadOptions {
  cli: { configPath?: string };
  env: NodeJS.ProcessEnv;
}

function fromYaml(path?: string): PartialDeep<Config> {
  if (!path) return {};
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  const doc = YAML.parse(raw) || {};
  return doc as any;
}

function applyEnv(cfg: Config, env: NodeJS.ProcessEnv): Config {
  const copy = JSON.parse(JSON.stringify(cfg)) as Config;

  // Model (answer) quick override
  if (env.MODEL_ANSWER) {
    if (!copy.model_profiles.answer) copy.model_profiles.answer = { model: '', reasoning_effort: 'medium', verbosity: 'medium' } as any;
    copy.model_profiles.answer.model = String(env.MODEL_ANSWER);
  }
  if (env.ANSWER_EFFORT) {
    const v = String(env.ANSWER_EFFORT).toLowerCase();
    if (v === 'low' || v === 'medium' || v === 'high') (copy.model_profiles.answer as any).reasoning_effort = v;
  }
  if (env.ANSWER_VERBOSITY) {
    const v = String(env.ANSWER_VERBOSITY).toLowerCase();
    if (v === 'low' || v === 'medium' || v === 'high') (copy.model_profiles.answer as any).verbosity = v;
  }

  if (env.OPENAI_API_TIMEOUT) {
    const n = Number(env.OPENAI_API_TIMEOUT);
    if (!Number.isNaN(n) && n > 0) copy.request.timeout_ms = n;
  }
  if (env.OPENAI_MAX_RETRIES) {
    const n = Number(env.OPENAI_MAX_RETRIES);
    if (!Number.isNaN(n) && n >= 0 && n <= 10) copy.request.max_retries = n;
  }
  if (env.SEARCH_MAX_RESULTS) {
    const n = Number(env.SEARCH_MAX_RESULTS);
    if (!Number.isNaN(n) && n >= 1 && n <= 10) copy.search.defaults.max_results = n;
  }
  if (env.SEARCH_RECENCY_DAYS) {
    const n = Number(env.SEARCH_RECENCY_DAYS);
    if (!Number.isNaN(n) && n >= 0) copy.search.defaults.recency_days = n;
  }
  if (env.MAX_CITATIONS) {
    const n = Number(env.MAX_CITATIONS);
    if (!Number.isNaN(n) && n >= 1 && n <= 10) copy.policy.max_citations = n;
  }
  // Codex defaults via ENV
  if (env.CODEX_DEFAULT_SANDBOX) {
    const v = String(env.CODEX_DEFAULT_SANDBOX);
    if (['read-only','workspace-write','danger-full-access'].includes(v)) (copy as any).codex_defaults.sandbox = v as any;
  }
  if (env.CODEX_DEFAULT_APPROVAL_POLICY) {
    const v = String(env.CODEX_DEFAULT_APPROVAL_POLICY);
    if (['untrusted','on-failure','on-request','never'].includes(v)) (copy as any).codex_defaults.approval_policy = v as any;
  }
  if (env.CODEX_DEFAULT_TIMEOUT_MS) {
    const n = Number(env.CODEX_DEFAULT_TIMEOUT_MS);
    if (!Number.isNaN(n) && n > 0) (copy as any).codex_defaults.timeout_ms = n;
  }
  if (env.CODEX_DEFAULT_JSON_MODE !== undefined) {
    const v = String(env.CODEX_DEFAULT_JSON_MODE).toLowerCase();
    (copy as any).codex_defaults.json_mode = (v === '1' || v === 'true' || v === 'yes');
  }
  if (env.CODEX_DEFAULT_SKIP_GIT_REPO_CHECK !== undefined) {
    const v = String(env.CODEX_DEFAULT_SKIP_GIT_REPO_CHECK).toLowerCase();
    (copy as any).codex_defaults.skip_git_repo_check = (v === '1' || v === 'true' || v === 'yes');
  }
  if (env.EXPOSE_ANSWER_TOOLS !== undefined) {
    const v = String(env.EXPOSE_ANSWER_TOOLS).toLowerCase();
    copy.server.expose_answer_tools = (v === '1' || v === 'true' || v === 'yes');
  }
  // Unified DEBUG specification:
  // - If `DEBUG` is "1"/"true", then server.debug = true
  // - Otherwise, if non-empty string, then server.debug = true and store value in server.debug_file
  if (env.DEBUG !== undefined) {
    const vraw = String(env.DEBUG);
    const v = vraw.toLowerCase();
    if (v === '1' || v === 'true') {
      copy.server.debug = true;
    } else if (vraw && vraw.length > 0) {
      copy.server.debug = true;
      (copy.server as any).debug_file = vraw;
    }
  }
  return copy;
}

export interface Loaded {
  effective: Config;
  sources: { ts_defaults: true; yaml?: string; env: string[]; cli: string[] };
}

export function loadConfig(opts: LoadOptions): Loaded {
  let current = defaults as Config;
  const envTouched: string[] = [];
  const cliTouched: string[] = [];

  const yamlPath = opts.cli.configPath;
  const yaml = fromYaml(yamlPath);
  current = deepMerge(current, yaml);

  const beforeEnv = JSON.stringify(current);
  current = applyEnv(current, opts.env);
  const afterEnv = JSON.stringify(current);
  if (beforeEnv !== afterEnv) {
    const keys = [
      "MODEL_ANSWER",
      "ANSWER_EFFORT",
      "ANSWER_VERBOSITY",
      "OPENAI_API_TIMEOUT",
      "OPENAI_MAX_RETRIES",
      "SEARCH_MAX_RESULTS",
      "SEARCH_RECENCY_DAYS",
      "MAX_CITATIONS",
      "DEBUG",
      "EXPOSE_ANSWER_TOOLS",
      "CODEX_DEFAULT_SANDBOX",
      "CODEX_DEFAULT_APPROVAL_POLICY",
      "CODEX_DEFAULT_TIMEOUT_MS",
      "CODEX_DEFAULT_JSON_MODE",
      "CODEX_DEFAULT_SKIP_GIT_REPO_CHECK"
    ];
    for (const k of keys) if (opts.env[k] !== undefined) envTouched.push(k);
  }

  // Model override from CLI not supported (unified in YAML)

  // Configuration value validation (fail fast)
  validateConfig(current);

  return {
    effective: current,
    sources: {
      ts_defaults: true,
      yaml: (yamlPath && existsSync(yamlPath)) ? yamlPath : undefined,  // placeholder
      env: envTouched,
      cli: cliTouched
    }
  } as any;
}

function validateConfig(cfg: Config): void {
  const allowedEffort = new Set(["low", "medium", "high"]);
  const profiles = cfg.model_profiles as any;
  for (const name of Object.keys(profiles)) {
    const p = profiles[name];
    if (!p) continue;
    const eff = p.reasoning_effort as string;
    if (!allowedEffort.has(eff)) {
      throw new Error(`Invalid model_profiles.${name}.reasoning_effort: ${eff} (allowed: low|medium|high)`);
    }
  }

  const codex = cfg.codex as any;
  if (!codex) return;
  if (typeof codex.cacheTtlMs !== "number" || codex.cacheTtlMs <= 0) {
    throw new Error(`codex.cacheTtlMs must be positive (ms)`);
  }
  if (typeof codex.cacheMaxEntries !== "number" || codex.cacheMaxEntries < 1) {
    throw new Error(`codex.cacheMaxEntries must be >= 1`);
  }
  if (typeof codex.validationRateLimitMs !== "number" || codex.validationRateLimitMs < 0) {
    throw new Error(`codex.validationRateLimitMs must be >= 0`);
  }
  if (codex.healthCheckPort !== undefined) {
    const port = Number(codex.healthCheckPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`codex.healthCheckPort must be an integer between 1 and 65535`);
    }
  }
}
