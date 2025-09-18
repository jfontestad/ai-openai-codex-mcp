
# Installation Instructions (Local / npm) - `docs/reference/installation.md`
Last Updated: 2025-08-15 (Asia/Tokyo, AI verified)

This document provides **complete procedures** for building and using **openai-responses-mcp** in local environments.
**npm pinning** (we don't handle pnpm/yarn). For MCP client (Claude) registration, refer to the separate `client-setup-claude.md`.

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
npx openai-responses-mcp@latest --stdio
```
- Verification: If `initialize` and `tools/list` return from client (Claude), connectivity is OK.

---

## 2. Acquisition Methods
### 2.1 Download and Extract ZIP from GitHub
```
openai-responses-mcp/
  - src/ ...            # TypeScript source
  - build/ ...          # Build artifacts (empty initially)
  - docs/ ...           # Documentation
  - config/config.yaml.example
  - package.json
  - tsconfig.json
```

> Repository operation is optional. Here we assume ZIP extraction.

---

## 3. Dependencies Installation and Build
```bash
# In project root directory
npm ci
npm run build
```

- On success, `build/index.js` is generated.
- After this, CLI can be launched with `node build/index.js` or `npx openai-responses-mcp` (when installed as npm package).

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
npx openai-responses-mcp --show-config 2> effective.json
npx openai-responses-mcp --show-config --config ./config/config.yaml 2> effective.json
MODEL_ANSWER=gpt-5 npx openai-responses-mcp --show-config 2> effective.json
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

## 7. Verify Installation Location (Local/Global/npx)

### 7.1 Local (Under project or tgz pseudo-installation)
If you run `npm i` or `npm i <tgz>` immediately, it will be placed in the current `node_modules`.

Example (continuation of tgz pseudo-installation procedure):
```
echo "$TMP"
ls -la "$TMP/node_modules/openai-responses-mcp"
ls -la "$TMP/node_modules/.bin"
"$TMP/node_modules/.bin/openai-responses-mcp" --show-config 2> effective.json
```

### 7.2 Global Installation (Optional)
Running `npm i -g openai-responses-mcp` will place it in the global bin directory. Usually `npx` is sufficient.

```
npm bin -g
which openai-responses-mcp
```

### 7.3 npx Execution (Cache)
`npx openai-responses-mcp@latest` is temporarily downloaded to npm cache and executed (path depends on internal implementation).
The operation flow can be confirmed with verbose mode.

```
npx -y openai-responses-mcp@latest --version --loglevel=verbose
npm config get cache   # Cache directory location
```

> Note: `npx` cache location varies by environment and npm version. For permanent location fixing, install locally (project) or globally.

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

## 10. Introduction as npm Package (Local Verification)
Generate package in repository root and verify `npx` execution by installing from **separate directory**.

```bash
# Package generation
npm pack

# Verification in temporary directory
TMP=$(mktemp -d); pushd "$TMP" >/dev/null
npm init -y >/dev/null
npm i "$OLDPWD"/openai-responses-mcp-*.tgz >/dev/null
npx openai-responses-mcp --help
npx openai-responses-mcp --version
popd >/dev/null
```

> Effective for pre-publication local verification. Use `npm publish` for official publication.

---

## 11. Uninstall / Cleanup
- Remove local dependencies: `rm -rf node_modules/` (Windows: `rd /s /q node_modules`)
- Remove build artifacts: `rm -rf build/`
- Remove npm global installation (optional): `npm uninstall -g openai-responses-mcp`

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
