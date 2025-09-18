
# Configuration Reference — `docs/reference/config-reference.md`
Last Updated: 2025-08-15 (Asia/Tokyo, AI verified)

This document provides a complete specification for **openai-responses-mcp** configuration.
Configuration **priority** is **CLI > ENV > YAML > TS defaults** (last wins, objects are deep merged / arrays are replaced).

---

## 1. Load Order and Priority Rules

1. **TS defaults** (defaults in source code)
2. **YAML** (`--config <path>` or default path)
3. **ENV** (environment variables)
4. **CLI** (`--model` etc.)

- **Merge rules**: Objects are deep merged. **Arrays are replaced** (not concatenated).
- Actually applied final values can be checked with `--show-config` (`sources` also outputs where they were reflected from). Output destination is stderr.

---

## 2. Default YAML Paths

- macOS/Linux: `~/.config/openai-responses-mcp/config.yaml`
- Windows: `%APPDATA%\openai-responses-mcp\config.yaml`

If you specify `--config <path>`, that path will be used. If it doesn't exist, YAML is skipped.

---

## 3. Configuration Schema (Logical Structure)

```yaml
openai:
  api_key_env: string              # e.g., OPENAI_API_KEY (ENV name)
  base_url: string                 # e.g., https://api.openai.com/v1

# Multi-profile configuration
model_profiles:
  answer:                          # Standard tool (required)
    model: string                  # e.g., gpt-5-mini
    reasoning_effort: string       # low|medium|high (recommended)
    verbosity: string              # low|medium|high
  answer_detailed:                 # Detailed analysis (optional)
    model: string                  # e.g., gpt-5
    reasoning_effort: string
    verbosity: string
  answer_quick:                    # Fast response (optional)
    model: string                  # e.g., gpt-5-nano
    reasoning_effort: string
    verbosity: string

request:
  timeout_ms: number               # e.g., 300000 (ms)
  max_retries: number              # 0..10 recommended

policy:
  prefer_search_when_unsure: boolean
  max_citations: number            # 1..10
  require_dates_iso: boolean
  system:
    source: "builtin" | "file"     # default builtin (YAML-only control)
    path: string                   # e.g., ~/.config/openai-responses-mcp/policy.md
    merge: "replace"|"prepend"|"append" # default replace

search:
  defaults:
    recency_days: number           # >=0
    max_results: number            # 1..10
    domains: string[]              # preferred domains (can be empty)

server:
  transport: "stdio"               # default "stdio"
  debug: boolean                   # default false (ON for detailed logs)
  debug_file: string|null          # default null (when path specified: file + screen mirror)
  show_config_on_start: boolean    # default false (output effective config summary to stderr on startup)
```

---

## 4. Defaults (TS defaults)

```yaml
openai:
  api_key_env: OPENAI_API_KEY
  base_url: https://api.openai.com/v1

# Multi-profile defaults
model_profiles:
  answer: { model: gpt-5-mini, reasoning_effort: medium, verbosity: medium }

request: { timeout_ms: 300000, max_retries: 3 }

policy:
  prefer_search_when_unsure: true
  max_citations: 3
  require_dates_iso: true

search:
  defaults: { recency_days: 60, max_results: 5, domains: [] }

server: { transport: stdio, debug: false, debug_file: null, show_config_on_start: false }
```

---

## 5. Complete YAML Examples

### 5.1 Minimal
```yaml
model_profiles:
  answer:
    model: gpt-5-mini
    reasoning_effort: medium
    verbosity: medium
```

### 5.2 Representative Example (Recommended)
```yaml
openai:
  api_key_env: OPENAI_API_KEY
  base_url: https://api.openai.com/v1

# Multi-profile configuration (v0.4.0+)
model_profiles:
  answer_detailed:
    model: gpt-5
    reasoning_effort: high
    verbosity: high
  answer:
    model: gpt-5-mini
    reasoning_effort: medium
    verbosity: medium
  answer_quick:
    model: gpt-5-mini
    reasoning_effort: low
    verbosity: low

request:
  timeout_ms: 300000
  max_retries: 3

policy:
  prefer_search_when_unsure: true
  max_citations: 3
  require_dates_iso: true

search:
  defaults:
    recency_days: 60
    max_results: 5
    domains: []

server:
  transport: stdio
  debug: true
  debug_file: ./_debug.log
  show_config_on_start: true
```

---

## 6. Environment Variables (ENV)

> The ENV variables listed here take **priority over YAML** when set.

| ENV Name | Type/Range | Mapped To | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | string | OpenAI authentication | **Required**. ENV name pointed to by `openai.api_key_env` (configurable). |
| `OPENAI_API_TIMEOUT` | number(ms) | `request.timeout_ms` | >0 |
| `OPENAI_MAX_RETRIES` | integer | `request.max_retries` | 0..10 |
| `SEARCH_MAX_RESULTS` | integer | `search.defaults.max_results` | 1..10 |
| `SEARCH_RECENCY_DAYS` | integer | `search.defaults.recency_days` | >=0 |
| `MAX_CITATIONS` | integer | `policy.max_citations` | 1..10 |
| `DEBUG` | 1/true/path | `server.debug`/`server.debug_file` | `1|true` enables debug, `<path>` mirrors to file |
| `MODEL_ANSWER` | string | `model_profiles.answer.model` | Quick override (permanent settings should use YAML) |
| `ANSWER_EFFORT` | enum | `model_profiles.answer.reasoning_effort` | `low`/`medium`/`high` |
| `ANSWER_VERBOSITY` | enum | `model_profiles.answer.verbosity` | `low`/`medium`/`high` |

> When `openai.api_key_env` is changed to `MY_KEY`, set **`MY_KEY`**. `OPENAI_API_KEY` will not be read.

Note (Unified Debug Enablement Logic)
- Debug treats CLI / ENV / YAML as equivalent, with priority **CLI > ENV > YAML**.
- The final state (enabled/file) is determined at application startup, and thereafter follows common judgment (`isDebug()`).
- Even when only `server.debug: true` is specified in YAML, debug logs are equally enabled in all modules.

---

## 7. CLI Options (Configuration-related)

```text
--show-config [--config <path>]
--config <path>     : Explicit YAML path (default path when omitted)
```

Output goes to stderr. Example:
```bash
node build/index.js --show-config 2> effective-config.json
```

---

## 8. Verifying Effective Configuration (Output Example)

```json
{
  "version": "<pkg.version>",
  "sources": {
    "ts_defaults": true,
    "yaml": "/home/user/.config/openai-responses-mcp/config.yaml",
    "env": [],
    "cli": []
  },
  "effective": {
    "openai": { "api_key_env": "OPENAI_API_KEY", "base_url": "https://api.openai.com/v1" },
    "model_profiles": { "answer": { "model": "gpt-5", "reasoning_effort": "medium", "verbosity": "medium" } },
    "request": { "timeout_ms": 300000, "max_retries": 3 },
    
    "policy": { "prefer_search_when_unsure": true, "max_citations": 3, "require_dates_iso": true },
    "search": { "defaults": { "recency_days": 60, "max_results": 5, "domains": [] } },
    "server": { "transport": "stdio", "debug": true, "debug_file": "./_debug.log", "show_config_on_start": true }
  }
}
```

---

## 9. Constraints (Validation Guidelines)
- `request.timeout_ms` > 0  
- `request.max_retries` ∈ [0,10]  
- `policy.max_citations` ∈ [1,10]  
- `policy.requery_attempts` ∈ [0,3]  
- `search.defaults.max_results` ∈ [1,10]  
- `search.defaults.recency_days` ≥ 0  
  

Invalid values may not necessarily cause errors and may be applied as-is. We recommend inspecting the JSON (stderr) from `--show-config` in CI.

---

## 10. Security Notes
- **API keys are not written to YAML**. Always obtained from ENV (variable pointed to by `openai.api_key_env`).
- When pointing `base_url` to a private proxy, please follow your organization's security policies.

---

<!-- Additional parameter considerations (undecided items) are moved to docs/_drafts/config-additional-params.md -->

## 12. Frequently Asked Questions (Excerpts)
- **Q: Works without YAML?** → Yes. Works with just TS defaults and ENV/CLI.
- **Q: Multiple domains?** → Passed as hints, influences model's search decisions (not forced filtering).
- **Q: Why always allow web_search?** → Let model decide "execute when needed" to prevent missing **current events**.
