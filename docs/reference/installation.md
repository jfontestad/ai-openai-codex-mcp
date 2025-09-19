
# Installation Instructions (Local Only) - `docs/reference/installation.md`
Last Updated: 2025-08-15 (Asia/Tokyo, AI verified)

This document provides procedures for building and using **openai-responses-mcp** locally (personal use).
This project is not intended for publishing to any registry. For MCP client (Claude) registration, refer to `client-setup-claude.md`.

---

## 1. Prerequisites
- OS: macOS / Linux / Windows (PowerShell)
- Node.js: **v20 or higher** (recommended: v24 series)
- npm: Stable version bundled with Node
- OpenAI API key (passed via environment variables)

> Version check
```bash
node -v
npm -v
```

---

## 2. Minimal Configuration (Startup with Required Settings Only)
- Required ENV: `OPENAI_API_KEY`
- Startup (no YAML needed):
```bash
export OPENAI_API_KEY="sk-..."
npm ci && npm run build
node build/index.js --stdio
```
- Verification: If `initialize` and `tools/list` return from client (Claude), connectivity is OK.

---

## 2. Acquisition Methods
### 2.1 Clone or Download Locally
```
openai-responses-mcp/
  - src/ ...            # TypeScript source
  - build/ ...          # Build artifacts (empty initially)
  - docs/ ...           # Documentation
  - config/config.yaml.example
  - package.json
  - tsconfig.json
```

> This guide assumes local use only (no registry publishing).

---

## 3. Dependencies Installation and Build
```bash
# In project root directory
npm ci
npm run build
```

- On success, `build/index.js` is generated.
- After this, launch with `node build/index.js`.

---

## 4. API Key Configuration (Required)
- By default, it references **`OPENAI_API_KEY`** (see `docs/reference/config-reference.md`).
- Configuration method varies by shell. Examples:

**bash/zsh (macOS/Linux)**
```bash
export OPENAI_API_KEY="sk-..."
```

**PowerShell (Windows)**
```powershell
$env:OPENAI_API_KEY="sk-..."
```

> If you changed `openai.api_key_env` in YAML, set it with that ENV name.

---

## 5. Configuration File (Optional)
YAML is **optional**. It works without it (TS defaults + ENV/CLI).

### 5.1 Placement Location
- Default:
  - macOS/Linux: `~/.config/openai-responses-mcp/config.yaml`
  - Windows: `%APPDATA%\openai-responses-mcp\config.yaml`
- Explicit: `--config /abs/path/config.yaml`

### 5.2 Sample
```yaml
model_profiles:
  answer:
    model: gpt-5-mini
    reasoning_effort: medium
    verbosity: medium

request:
  timeout_ms: 120000
  max_retries: 3
```

> Arrays are **replaced**, objects are **deep merged**. Priority is **CLI > ENV > YAML > TS**.

---

## 6. Basic Commands
```bash
# Version/help
node build/index.js --version
node build/index.js --help

# Check effective configuration (sources show where settings come from)
node build/index.js --show-config 2> effective.json
node build/index.js --show-config --config ./config/config.yaml 2> effective.json
MODEL_ANSWER=gpt-5 node build/index.js --show-config 2> effective.json
```

Expected example (excerpt):
```json
{
  "version": "0.4.0",
  "sources": { "ts_defaults": true, "yaml": "./config/config.yaml", "env": ["MODEL_ANSWER"], "cli": [] },
  "effective": { "model_profiles": { "answer": { "model": "gpt-5.2", "reasoning_effort": "medium", "verbosity": "medium" } } }
}
```

---

## 7. Execution Location
Run directly from your cloned project directory. Global or `npx` usage is not supported in this setup.

---

## 7. Unit Smoke Test (MCP Protocol)
```bash
# LDJSON (no API key required)
npm run mcp:smoke:ldjson | tee /tmp/mcp-smoke-ldjson.out
grep -c '"jsonrpc":"2.0"' /tmp/mcp-smoke-ldjson.out

# Content-Length (requires OPENAI_API_KEY)
export OPENAI_API_KEY="sk-..."
npm run mcp:smoke | tee /tmp/mcp-smoke.out
grep -c '^Content-Length:' /tmp/mcp-smoke.out
```

---

## 8. MCP Protocol Smoke Test
```bash
npm run mcp:smoke | tee /tmp/mcp-smoke.out
grep -c '^Content-Length:' /tmp/mcp-smoke.out   # 3 or more
```
If you can confirm 3 responses of `initialize -> tools/list -> tools/call(answer)`, the stdio layer is healthy.

---

## 9. Claude Registration (Overview)
- Register in Claude's configuration file under `mcpServers` (**details in** `client-setup-claude.md`).
- Example:
```json
{
  "mcpServers": {
    "openai-responses": {
      "command": "node",
      "args": ["/ABS/PATH/openai-responses-mcp/build/index.js", "--stdio"],
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

---

## 10. (Removed) Registry Publishing
This project is local-only. Do not publish packages or verify via `npx`/`npm pack`.

---

## 11. Uninstall / Cleanup
- Remove local dependencies: `rm -rf node_modules/` (Windows: `rd /s /q node_modules`)
- Remove build artifacts: `rm -rf build/`

---

## 12. Troubleshooting
- **Missing API key**: `OPENAI_API_KEY` not set. Review ENV settings.
- **Cannot find module build/index.js**: `npm run build` not executed or failed.
- **Content-Length error**: Binary/line break contamination. Rebuild and run `npm run mcp:smoke`.
- **429/5xx frequent**: Increase retry limit (`RETRIES`). Adjust `TIMEOUT`.
- **Model not supported**: Revert `MODEL_ANSWER` to stable version.

---

## 13. Security Notes
- Pass API keys **via ENV only**. Storing in plain text in YAML/JSON is prohibited.
- Don't leave secrets in logs. Limit to minimal metadata (model name, retry count, latency).
- On shared terminals, `unset OPENAI_API_KEY` after work (PowerShell: `$env:OPENAI_API_KEY=$null`).
