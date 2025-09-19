import { Config } from "../config/defaults.js";
import { CodexAuthLoader, Logger } from "../codex/loader.js";
import { CodexCliProcessRunner } from "../codex/cli.js";
import { BasicTokenValidator } from "../codex/validator.js";

export type CredentialSource = "codex_oauth" | "codex_api_key" | "env_api_key" | "missing";
export type CredentialState = "healthy" | "degraded" | "unhealthy";

export interface CredentialResolution {
  state: CredentialState;
  source: CredentialSource;
  detail: string;
  apiKey?: string;
  metadata: {
    path?: string | null;
    lastRefresh?: string | null;
    fallbackReason?: string | null;
  };
}

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  dependencies?: {
    createLoader?: (args: {
      cfg: Config;
      env: NodeJS.ProcessEnv;
      logger: Logger;
    }) => CodexAuthLoader;
  };
}

const defaultLogger: Logger = {
  info: () => {},
  warn: (msg: string) => console.warn(`[codex-auth] ${msg}`),
  error: (msg: string) => console.error(`[codex-auth] ${msg}`)
};

function defaultLoaderFactory({ cfg, env, logger }: { cfg: Config; env: NodeJS.ProcessEnv; logger: Logger }) {
  return new CodexAuthLoader({
    config: {
      authPath: cfg.codex.authPath,
      autoRefresh: cfg.codex.autoRefresh,
      permissionStrict: cfg.codex.permissionStrict,
      cacheMaxEntries: cfg.codex.cacheMaxEntries,
      cacheTtlMs: cfg.codex.cacheTtlMs,
      validationRateLimitMs: cfg.codex.validationRateLimitMs
    },
    env,
    openaiBaseUrl: cfg.openai.base_url,
    cli: new CodexCliProcessRunner({ env, logger }),
    validator: new BasicTokenValidator(),
    logger
  });
}

export async function resolveOpenAICredentials(cfg: Config, opts: ResolveOptions = {}): Promise<CredentialResolution> {
  const env = opts.env ?? process.env;
  const logger = opts.logger ?? defaultLogger;
  const loaderFactory = opts.dependencies?.createLoader ?? defaultLoaderFactory;

  // 1) ENV override (highest priority): if the configured env var is present, prefer it
  const envKeyNameFirst = cfg.openai.api_key_env;
  const envValueFirst = env[envKeyNameFirst]?.trim();
  if (envValueFirst) {
    return {
      state: "healthy",
      source: "env_api_key",
      detail: `Using ${envKeyNameFirst} environment variable`,
      apiKey: envValueFirst,
      metadata: { path: null, lastRefresh: null, fallbackReason: null }
    };
  }

  let codexAttempted = false;
  let codexError: Error | null = null;

  if (cfg.codex?.enabled !== false) {
    try {
      const loader = loaderFactory({ cfg, env, logger });
      codexAttempted = true;
      const auth = await loader.getToken();
      const isOauth = auth.kind === "oauth";
      const detail = isOauth
        ? `Codex auth.json (${auth.metadata.path ?? "unknown"}) access token ready`
        : `Codex auth.json provided API key fallback (${auth.metadata.path ?? "unknown"})`;
      return {
        state: isOauth ? "healthy" : "degraded",
        source: isOauth ? "codex_oauth" : "codex_api_key",
        detail,
        apiKey: auth.accessToken,
        metadata: {
          path: auth.metadata.path ?? null,
          lastRefresh: auth.metadata.lastRefresh ?? null,
          fallbackReason: isOauth ? null : "auth.json contains API key"
        }
      };
    } catch (err) {
      codexError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`Codex auth reuse failed: ${codexError.message}`);
    }
  }

  // 2) ENV fallback if Codex failed (kept for completeness)
  const envKeyName = cfg.openai.api_key_env;
  const envValue = env[envKeyName]?.trim();
  if (envValue) {
    const detail = `Using ${envKeyName} after Codex reuse failed: ${codexError?.message ?? 'unknown error'}`;
    return {
      state: "degraded",
      source: "env_api_key",
      detail,
      apiKey: envValue,
      metadata: { path: null, lastRefresh: null, fallbackReason: codexError?.message ?? null }
    };
  }

  const detail = codexAttempted
    ? `Codex auth reuse failed (${codexError?.message ?? "unknown error"}) and ${envKeyName} is unset`
    : `Codex reuse disabled and ${envKeyName} is unset`;

  return {
    state: "unhealthy",
    source: "missing",
    detail,
    metadata: {
      path: null,
      lastRefresh: null,
      fallbackReason: codexError?.message ?? null
    }
  };
}

export { defaultLogger as credentialLogger };
