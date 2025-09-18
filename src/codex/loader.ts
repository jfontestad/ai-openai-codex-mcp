import { readFileSync, statSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolveAuthPath, PathResolutionEnv } from "./paths.js";

export type AuthKind = "oauth" | "api_key";

export interface AuthResult {
  kind: AuthKind;
  accessToken: string;
  refreshToken?: string;
  metadata: {
    path: string;
    lastRefresh?: string;
  };
}

export interface CodexCliTransport {
  refresh(): Promise<{ ok: boolean }>;
  login(): Promise<{ ok: boolean }>;
}

export interface TokenValidator {
  validate(token: string, info: { kind: AuthKind; baseUrl: string }): Promise<boolean>;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

interface CacheEntry {
  expiresAt: number;
  mtimeMs: number | null;
  result: AuthResult;
}

interface AuthJsonTokens {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
}

interface AuthJson {
  OPENAI_API_KEY?: string;
  tokens?: AuthJsonTokens;
  last_refresh?: string;
}

export interface CodexAuthLoaderOptions {
  config: {
    authPath: string;
    autoRefresh: boolean;
    permissionStrict: boolean;
    cacheMaxEntries: number;
    cacheTtlMs: number;
    validationRateLimitMs: number;
  };
  env: PathResolutionEnv;
  openaiBaseUrl: string;
  cli: CodexCliTransport;
  validator: TokenValidator;
  logger?: Logger;
  now?: () => number;
}

export class CodexAuthLoader {
  private readonly config: CodexAuthLoaderOptions["config"];
  private readonly env: PathResolutionEnv;
  private readonly cli: CodexCliTransport;
  private readonly validator: TokenValidator;
  private readonly logger: Logger;
  private readonly openaiBaseUrl: string;
  private readonly now: () => number;

  private cache: CacheEntry | null = null;
  private lastValidated: { token: string; timestamp: number; kind: AuthKind } | null = null;

  constructor(opts: CodexAuthLoaderOptions) {
    this.config = opts.config;
    this.env = opts.env;
    this.cli = opts.cli;
    this.validator = opts.validator;
    this.logger = opts.logger ?? noopLogger;
    this.openaiBaseUrl = opts.openaiBaseUrl;
    this.now = opts.now ?? (() => Date.now());
  }

  async getToken(): Promise<AuthResult> {
    const authPath = resolveAuthPath({ authPath: this.config.authPath }, this.env);
    const stat = safeStat(authPath);
    if (this.config.permissionStrict && stat) {
      ensureSecurePermissions(authPath, stat.mode);
    }

    if (this.cache && stat && this.cache.mtimeMs === stat.mtimeMs && this.cache.expiresAt > this.now()) {
      return this.cache.result;
    }

    let json = this.loadAuthJson(authPath);
    if (!json) {
      json = await this.ensureLogin(authPath);
      const afterLogin = json ?? this.loadAuthJson(authPath);
      if (!afterLogin) {
        throw new Error(`Codex auth unavailable after attempting login at ${authPath}`);
      }
      json = afterLogin;
    }

    if (this.config.autoRefresh) {
      json = await this.maybeRefresh(authPath, json);
    }

    return this.cacheAndReturn(authPath, json, stat?.mtimeMs ?? null);
  }

  private async cacheAndReturn(path: string, data: AuthJson, mtimeMs?: number | null): Promise<AuthResult> {
    let result = this.pickAuth(path, data);

    const validationOutcome = await this.ensureValid(path, result, data);
    result = validationOutcome.result;
    const sourceData = validationOutcome.data;

    this.cache = {
      expiresAt: this.now() + this.config.cacheTtlMs,
      mtimeMs: mtimeMs ?? safeStat(path)?.mtimeMs ?? null,
      result
    };
    return result;
  }

  private async ensureValid(path: string, initial: AuthResult, data: AuthJson): Promise<{ result: AuthResult; data: AuthJson }> {
    const shouldValidate = this.shouldValidate(initial);
    if (!shouldValidate) {
      return { result: initial, data };
    }

    const valid = await this.validator.validate(initial.accessToken, {
      kind: initial.kind,
      baseUrl: this.openaiBaseUrl
    });

    if (valid) {
      this.lastValidated = { token: initial.accessToken, timestamp: this.now(), kind: initial.kind };
      return { result: initial, data };
    }

    if (initial.kind === "oauth" && this.config.autoRefresh) {
      const refreshedData = await this.performRefresh(path);
      const refreshed = this.pickAuth(path, refreshedData);
      const ok = await this.validator.validate(refreshed.accessToken, {
        kind: refreshed.kind,
        baseUrl: this.openaiBaseUrl
      });
      if (!ok) {
        throw new Error(`Codex credentials from ${path} invalid after refresh`);
      }
      this.lastValidated = { token: refreshed.accessToken, timestamp: this.now(), kind: refreshed.kind };
      return { result: refreshed, data: refreshedData };
    }

    throw new Error(`Codex credentials from ${path} failed validation`);
  }

  private shouldValidate(result: AuthResult): boolean {
    if (!this.lastValidated) return true;
    if (this.lastValidated.token !== result.accessToken) return true;
    if (this.lastValidated.kind !== result.kind) return true;
    return (this.now() - this.lastValidated.timestamp) >= this.config.validationRateLimitMs;
  }

  private async maybeRefresh(path: string, data: AuthJson): Promise<AuthJson> {
    const tokens = data.tokens;
    if (!tokens?.refresh_token) return data;

    const lastRefreshIso = data.last_refresh;
    if (!lastRefreshIso) return data;

    const lastRefreshMs = Date.parse(lastRefreshIso);
    if (Number.isNaN(lastRefreshMs)) return data;

    const STALE_MS = 25 * 24 * 60 * 60 * 1000;
    if (this.now() - lastRefreshMs < STALE_MS) return data;

    return this.performRefresh(path);
  }

  private async performRefresh(path: string): Promise<AuthJson> {
    this.logger.info(`Refreshing Codex auth at ${path}`);
    const res = await this.cli.refresh();
    if (!res.ok) {
      throw new Error(`codex auth refresh failed for ${path}`);
    }
    const json = this.loadAuthJson(path);
    if (!json) {
      throw new Error(`codex refresh succeeded but auth.json missing at ${path}`);
    }
    return json;
  }

  private pickAuth(path: string, data: AuthJson): AuthResult {
    const tokens = data.tokens;
    if (tokens?.access_token && tokens.refresh_token) {
      return {
        kind: "oauth",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        metadata: { path, lastRefresh: data.last_refresh }
      };
    }
    if (data.OPENAI_API_KEY) {
      return {
        kind: "api_key",
        accessToken: data.OPENAI_API_KEY,
        metadata: { path, lastRefresh: data.last_refresh }
      };
    }
    throw new Error(`auth.json at ${path} does not contain usable credentials`);
  }

  private loadAuthJson(path: string): AuthJson | null {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.logger.warn(`Failed to parse auth.json at ${path}: ${(err as Error).message}`);
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const json = parsed as AuthJson;
    return json;
  }

  private async ensureLogin(path: string): Promise<AuthJson | null> {
    const attempts = 3;
    let delayMs = 1_000;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      this.logger.info(`Codex auth missing at ${path}, invoking codex login (attempt ${attempt}/${attempts})`);
      const res = await this.cli.login();
      if (res.ok) {
        return this.loadAuthJson(path);
      }
      if (attempt < attempts) {
        await sleep(delayMs);
        delayMs *= 2;
      }
    }
    throw new Error(`codex login failed for ${path}`);
  }
}

function safeStat(path: string) {
  try {
    return statSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureSecurePermissions(path: string, mode: number): void {
  if (process.platform === "win32") return;
  const worldMask = 0o077;
  if ((mode & worldMask) !== 0) {
    throw new Error(`auth.json at ${path} has overly broad permissions (mode=${mode.toString(8)})`);
  }
}
