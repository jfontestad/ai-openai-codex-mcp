export type Transport = "stdio";

export interface ModelProfile {
  model: string;
  // OpenAI official: only low | medium | high (minimal is not supported)
  reasoning_effort: "low" | "medium" | "high";
  verbosity: "low" | "medium" | "high";
}

export interface Config {
  openai: {
    api_key_env: string;
    base_url: string;
  };
  codex: {
    enabled: boolean;
    authPath: string;
    autoRefresh: boolean;
    permissionStrict: boolean;
    cacheTtlMs: number;
    cacheMaxEntries: number;
    validationRateLimitMs: number;
    healthCheckPort?: number;
  };
  model_profiles: {
    answer: ModelProfile;
    answer_detailed?: ModelProfile;
    answer_quick?: ModelProfile;
  };
  request: { timeout_ms: number; max_retries: number };
  policy: {
    prefer_search_when_unsure: boolean;
    max_citations: number;
    require_dates_iso: boolean;
    system?: {
      source: "builtin" | "file"; // External policy.md loading control (specified only in YAML)
      path?: string;               // Path to policy.md (tilde expansion supported)
      merge?: "replace" | "prepend" | "append"; // Merging method with built-in SSOT
    };
  };
  search: { defaults: { recency_days: number; max_results: number; domains: string[] } };
  server: { transport: Transport; debug: boolean; debug_file: string | null; show_config_on_start: boolean; expose_answer_tools: boolean };
  codex_defaults: {
    sandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
    approval_policy: 'untrusted' | 'on-failure' | 'on-request' | 'never';
    timeout_ms: number;
    json_mode: boolean;
    skip_git_repo_check: boolean;
  };
}

export const defaults: Config = {
  openai: {
    api_key_env: "OPENAI_API_KEY",
    base_url: "https://api.openai.com/v1"
  },
  codex: {
    enabled: true,
    authPath: "~/.codex/auth.json",
    autoRefresh: true,
    permissionStrict: true,
    cacheTtlMs: 5 * 60_000,
    cacheMaxEntries: 4,
    validationRateLimitMs: 5 * 60_000,
    healthCheckPort: undefined
  },
  model_profiles: {
    answer: {
      model: "gpt-5",
      reasoning_effort: "medium",
      verbosity: "medium"
    }
  },
  request: { timeout_ms: 300_000, max_retries: 3 },
  policy: {
    prefer_search_when_unsure: true,
    max_citations: 3,
    require_dates_iso: true,
    system: { source: "builtin", merge: "replace" }
  },
  search: { defaults: { recency_days: 60, max_results: 5, domains: [] } },
  server: { transport: "stdio", debug: false, debug_file: null, show_config_on_start: false, expose_answer_tools: true },
  codex_defaults: {
    sandbox: 'read-only',
    approval_policy: 'on-failure',
    timeout_ms: 15 * 60 * 1000,
    json_mode: true,
    skip_git_repo_check: true
  }
};
