
# Environment Setup (Local Development & Reproducibility) - `docs/reference/environment-setup.md`
Last Updated: 2025-08-15 (Asia/Tokyo, AI verified)

This document provides OS-specific concrete procedures for environment preparation to run **openai-responses-mcp** stably in local environments.
**npm pinning**. We don't use beta/alpha tools.

---

## 1. Requirements
- OS: macOS / Linux / Windows
- Node.js: **v20 or higher (recommended: v24 series)**
- npm: Stable version bundled with Node
- Network: HTTPS access to `api.openai.com`
- Pass OpenAI API key via **environment variables** (don't put secrets in YAML)

> Verification:
```bash
node -v
npm -v
```

---

## 2. Node.js Installation (Representative Patterns)
- Skip this section if Node is already installed.
- User-space installation without administrator privileges is recommended.

### 2.1 macOS
- Official installer (.pkg) or Homebrew (`brew install node@20` etc.).
- Verify that `node` / `npm` are in PATH.

### 2.2 Linux
- Distribution-bundled stable version (apt/dnf etc.) or official binaries.
- Install `build-essential` equivalent in case building is needed.

### 2.3 Windows
- Official installer (.msi). Launch PowerShell as "Run as Administrator" for verification.

> For any OS, if `node -v` displays without errors, you're OK.

---

## 3. Set API Key in Shell Environment
**Required**. Handle securely. Don't write directly to YAML/JSON.

### 3.1 Temporary (Current Terminal Only)
**bash/zsh (macOS/Linux)**
```bash
export OPENAI_API_KEY="sk-..."
```

**PowerShell (Windows)**
```powershell
$env:OPENAI_API_KEY="sk-..."
```

### 3.2 Persistent (Effective for Future Sessions)
**zsh**
```bash
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.zshrc
source ~/.zshrc
```

**bash**
```bash
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.bashrc
source ~/.bashrc
```

**PowerShell**
```powershell
[System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY","sk-...","User")
# Open new PowerShell to verify reflection
```

> ENV name defaults to `OPENAI_API_KEY`. If you changed `openai.api_key_env` in `docs/reference/config-reference.md`, set using that name.

---

## 4. Proxy/Corporate Network Setup (When Required)
When using corporate proxy, specify HTTPS path with the following environment variables.

```bash
export HTTPS_PROXY="http://proxy.example.com:8080"
export HTTP_PROXY="$HTTPS_PROXY"
export NO_PROXY="localhost,127.0.0.1"
```

Windows PowerShell:
```powershell
$env:HTTPS_PROXY="http://proxy.example.com:8080"
$env:HTTP_PROXY=$env:HTTPS_PROXY
$env:NO_PROXY="localhost,127.0.0.1"
```

> For environments using corporate CA, please properly register certificates in OS/Node trust store.

---

## 5. Project Initialization (Local)
```bash
# Get dependencies & build
npm ci
npm run build

# Sanity check
node build/index.js --help
node build/index.js --version
node build/index.js --show-config 2> effective-config.json
```

**Expected**: Executes without errors, and `--show-config` stderr output (`effective-config.json`) displays `effective.model_profiles.answer.model` and `sources`.

---

## 6. Configuration (Optional)
YAML is optional. Works without it. Default paths when placed:

- macOS/Linux: `~/.config/openai-responses-mcp/config.yaml`
- Windows: `%APPDATA%\openai-responses-mcp\config.yaml`

Minimal example:
```yaml
model_profiles:
  answer:
    model: gpt-5-mini
    reasoning_effort: medium
    verbosity: medium
```

**Priority**: CLI > ENV > YAML > TS (arrays are replaced, objects are deep merged).

---

## 7. Verification (MCP Layer)
```bash
# LDJSON smoke test (OpenAI API key not required)
npm run mcp:smoke:ldjson | tee /tmp/mcp-smoke-ldjson.out
grep -c '"jsonrpc":"2.0"' /tmp/mcp-smoke-ldjson.out

# Content-Length smoke test (requires OPENAI_API_KEY)
export OPENAI_API_KEY="sk-..."
npm run mcp:smoke | tee /tmp/mcp-smoke.out
grep -c '^Content-Length:' /tmp/mcp-smoke.out
```

---

## 8. Common Errors and Solutions
| Issue | Cause | Solution |
|---|---|---|
| `Missing API key` | Environment variable not set | `export OPENAI_API_KEY=...` |
| `Cannot find module build/index.js` | Build not executed | `npm run build` |
| `Content-Length` mismatch | Framing defect/newline contamination | Rebuild, run `mcp:smoke` |
| 429/5xx frequent | API side congestion/limits | Adjust retry limits/timeouts |
| Proxy-related TLS failure | Corporate CA not registered | Register in OS/Node trust store |

---

## 9. Recommendations for Reproducibility
- Pin Node major version (e.g., everyone unified on v24 series).
- Save `--show-config` stderr output and detect deviations with diff monitoring (CI).
- Secrets only in ENV. **Never** leave in logs/config files.
