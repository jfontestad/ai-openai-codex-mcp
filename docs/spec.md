
# Canonical Specification - `docs/spec.md`
Last Updated: 2025-08-24 (Asia/Tokyo, AI confirmed)  
Version: **v0.5.x**

This document is the **sole canonical specification** for **openai-responses-mcp**.  
Implementation, operation, and testing must conform to this specification.

---

## 0. Background & Purpose
- Provide a **lightweight** server for MCP clients like Claude Code to get search-enabled responses using the **OpenAI Responses API**.
- **Always allow** `tools: [{"type":"web_search"}]` for every request, letting the **model autonomously decide** whether to actually perform searches.
- Return **structured** responses (text, `used_search`, `citations[]`, `model` as required fields) to enhance client-side reusability.
- Support switching to compatible models via configuration (limited to Responses API + web_search compatible models). Policy and threshold changes can also be flexibly configured.

Non-goals: Full browser/crawler implementation, immediate implementation of non-stdio transports, client-side orchestration.

---

## 1. System Boundaries & Naming
- Product name: **openai-responses-mcp** (same for package name/CLI name)
- Server type: **MCP server**
- Connection method: **stdio** (JSON-RPC compatible + `Content-Length` framing)
- Main tools: **`answer` / `answer_detailed` / `answer_quick`**
- Reasoning core: **OpenAI Responses API** (JS SDK `openai`)
- Search tool: **`web_search`** (Responses built-in tool, always allowed)

---

## 2. Transport Specification (stdio)
### 2.1 Physical Layer
- Uses standard input/output (`stdin`/`stdout`). UTF-8, no BOM.
- Each message is framed as follows (preferred):
  ```http
  Content-Length: <bytes>\r\n
  \r\n
  <JSON-utf8>
  ```
  - `<bytes>` is the UTF-8 byte length of the JSON.
  - Multiple messages can be concatenated.
  - Compatibility mode: If client doesn't send Content-Length, line-delimited JSON (NDJSON-style) is also accepted, and subsequent responses are returned line-delimited.

### 2.2 Logical Layer
- JSON-RPC 2.0 compatible. Includes `"jsonrpc":"2.0"`.
- Supported methods:
  - `initialize`
  - `tools/list`
  - `tools/call`
  - `ping` (optional, for health checks. Returns empty object on success)

### 2.3 Initialization (Example)
**Receive**
```http
Content-Length: 118

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}
```
**Send**
```http
Content-Length: 142

{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"openai-responses-mcp","version":"<pkg.version>"}}}
```

### 2.4 Tool List (Example)
```http
Content-Length: 52

{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```
**Send**
```http
Content-Length: 458

{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"answer","description":"Execute Web search as needed and return responses with evidence (with sources)","inputSchema":{"type":"object","properties":{"query":{"type":"string"},"recency_days":{"type":"number"},"max_results":{"type":"number"},"domains":{"type":"array","items":{"type":"string"}},"style":{"enum":["summary","bullets","citations-only"]}},"required":["query"]}}]}} 
```

### 2.5 Tool Call (Example)
**Receive**
```http
Content-Length: 156

{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"answer","arguments":{"query":"What does HTTP 404 mean?","style":"summary"}}}
```
**Send (Success)**
```http
Content-Length: 204

{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"answer\":\"...\",\"used_search\":false,\"citations\":[],\"model\":\"gpt-5\"}"}]}}
```

### 2.6 ping (Optional)
**Receive (Example)**
```http
Content-Length: 36

{"jsonrpc":"2.0","id":99,"method":"ping"}
```
**Send (Example)**
```http
Content-Length: 28

{"jsonrpc":"2.0","id":99,"result":{}}
```

---

## 3. Tool Specification (Multi-profile Support)

### 3.0 Tool Overview
This system provides **3 dedicated tools** for different use cases:

| Tool Name | Purpose | Configuration Profile | Features |
|-----------|---------|----------------------|----------|
| `answer` | Standard responses (baseline) | `model_profiles.answer` | Balanced responses. **Required configuration** |
| `answer_detailed` | Detailed analysis | `model_profiles.answer_detailed` | Comprehensive research and deep analysis. Defaults to `answer` if omitted |
| `answer_quick` | Fast responses | `model_profiles.answer_quick` | Quick and concise responses. Defaults to `answer` if omitted |

MCP clients like Claude Code automatically select the optimal tool based on user instructions.

### 3.0.1 Unified Profile Configuration Specification
Multi-profile configuration follows these unified rules:

- **`answer` profile is required**: Startup error if not configured
- **Other profiles default to `answer`**: Uses `answer` configuration when not set
- **Legacy configuration is deprecated**: No longer use `openai.model.default`, etc.

**Configuration Example**:
```yaml
model_profiles:
  answer:           # Required profile
    model: gpt-5-mini
    reasoning_effort: medium
    verbosity: medium
  answer_detailed:  # Optional (defaults to answer if omitted)
    model: gpt-5
    reasoning_effort: high
    verbosity: high
  # answer_quick is omitted -> operates with answer configuration
```

**Minimal Configuration**:
```yaml
model_profiles:
  answer:  # Configure required profile only
    model: gpt-5-mini
    reasoning_effort: medium
    verbosity: medium
# All tools operate with this configuration
```
### 3.1 Individual Tool Specifications

#### 3.1.1 `answer` - Standard Response Tool (Baseline/Required)
```json
{
  "name": "answer",
  "description": "Search the web when needed and provide balanced, well-sourced answers. This is the standard general-purpose tool.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query":        { "type": "string" },
      "recency_days": { "type": "number" },
      "max_results":  { "type": "number" },
      "domains":      { "type": "array", "items": { "type": "string" } },
      "style":        { "enum": ["summary","bullets","citations-only"] }
    },
    "required": ["query"]
  }
}
```

#### 3.1.2 `answer_detailed` - Detailed Analysis Tool (Optional)
```json
{
  "name": "answer_detailed",
  "description": "Perform comprehensive analysis with thorough research and detailed explanations. Best for complex questions requiring deep investigation.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query":        { "type": "string" },
      "recency_days": { "type": "number" },
      "max_results":  { "type": "number" },
      "domains":      { "type": "array", "items": { "type": "string" } },
      "style":        { "enum": ["summary","bullets","citations-only"] }
    },
    "required": ["query"]
  }
}
```

#### 3.1.3 `answer_quick` - Fast Response Tool (Optional)
```json
{
  "name": "answer_quick", 
  "description": "Provide fast, concise answers optimized for speed. Best for simple lookups or urgent questions.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

**Tool Selection Guidelines**:
- **General questions**: Select `answer` (standard tool)
- **Complex analysis/comparison**: Select `answer_detailed`
- **Concise answers required**: Select `answer_quick`

### 3.2 Output Contract (JSON within MCP Text)
- `tools/call` responses store **JSON string** in `content[0].text`.
- The JSON must **strictly** follow this schema:
```json
{
  "answer": "string",
  "used_search": true,
  "citations": [
    {
      "url": "https://...",
      "title": "string (optional)",
      "published_at": "YYYY-MM-DD (optional)"
    }
  ],
  "model": "used model id (e.g., gpt-5)"
}
```
- **Order convention (response body side)**: Main text -> (if needed) bullet points -> (only when web_search is used) `Sources:` with URLs + ISO dates.

### 3.3 Search Determination
- Conditions for `used_search = true`:
  - Responses annotation contains 1 or more `url_citation` **OR**
  - `web_search` calls can be confirmed
- Number of sources is capped by `policy.max_citations` (1-10).

---

## 4. Model Instructions (System Policy)
- **Required**: Responses API `instructions` must be given **exactly** from **code-side SSOT (`src/policy/system-policy.ts`'s `SYSTEM_POLICY`)** (no modification allowed).
- Version identification: Reference `SYSTEM_POLICY_REV` (e.g., `2025-08-09 v0.4.0`).
- Role: Defines web_search judgment, source & date handling, relative date absolutization (Asia/Tokyo), multilingual support (Japanese priority), etc.

---

## 5. Configuration & Settings
### 5.1 Priority Order (Must Follow)
- **CLI > ENV > YAML > TS defaults**
  - Objects use **deep merge**
  - Arrays use **replacement** (no concatenation)

### 5.2 YAML Default Paths
- macOS/Linux: `~/.config/openai-responses-mcp/config.yaml`
- Windows: `%APPDATA%\openai-responses-mcp\config.yaml`
- When `--config <path>` is specified, it takes highest priority. If it doesn't exist, skip without error.

### 5.3 Representative Schema
```yaml
openai:
  api_key_env: OPENAI_API_KEY
  base_url: https://api.openai.com/v1

request: { timeout_ms: 120000, max_retries: 3 }

responses: { stream: false, json_mode: false }

model_profiles:
  answer:           # Required baseline profile
    model: gpt-5-mini
    reasoning_effort: medium
    verbosity: medium
    
  answer_detailed:  # Optional - for detailed analysis
    model: gpt-5
    reasoning_effort: high
    verbosity: high
    
  answer_quick:     # Optional - for fast responses
    model: gpt-5-nano
    reasoning_effort: minimal
    verbosity: low

policy:
  search_triggers: ["today","now","latest","breaking","price","cost","release","version","security","vulnerability","weather","exchange","news","EOL"]
  prefer_search_when_unsure: true
  max_citations: 3
  requery_attempts: 1
  require_dates_iso: true

search:
  defaults: { recency_days: 60, max_results: 5, domains: [] }

server: { transport: stdio, debug: false, debug_file: null, show_config_on_start: false }
```

### 5.4 Main Environment Variables
| ENV | Meaning |
|---|---|
| `OPENAI_API_KEY` | Authentication (ENV name pointed by `openai.api_key_env`) |
| `OPENAI_API_TIMEOUT` | `request.timeout_ms` |
| `OPENAI_MAX_RETRIES` | `request.max_retries` |
| `SEARCH_RECENCY_DAYS` | `search.defaults.recency_days` |
| `SEARCH_MAX_RESULTS` | `search.defaults.max_results` |
| `MAX_CITATIONS` | `policy.max_citations` |
| `REQUERY_ATTEMPTS` | `policy.requery_attempts` |
| `MODEL_ANSWER` | `model_profiles.answer.model` |
| `MODEL_DETAILED` | `model_profiles.answer_detailed.model` |
| `MODEL_QUICK` | `model_profiles.answer_quick.model` |
| `DEBUG` | `server.debug`/`server.debug_file` |

### 5.5 CLI Options
```
--stdio                          # Start stdio server (required for Claude integration)
--show-config                    # Output effective configuration (with sources) as JSON to stderr
--config <path>                  # Explicit YAML path
--model <id>                     # Temporarily override model_profiles.answer.model
--help / --version               # As is
```

### 5.6 Model Compatibility and Feature Application Scope
- `verbosity` application: Applied only when model ID is `gpt-5` series (prefix is `gpt-5`).
- `reasoning_effort` application: Applied for `gpt-5` / `o3` / `o4` series models. Ignored or may cause OpenAI-side errors for others.
- When unsupported model specified: May result in validation errors on OpenAI Responses API side, so specify only supported model IDs.
- Multi-profile inheritance: When `answer_detailed`/`answer_quick` are undefined, inherits `answer` settings and operates (current implementation).

---

## 6. Execution Flow (Multi-profile Support)
1. **Tool determination**: MCP client selects from `answer` / `answer_detailed` / `answer_quick`.
2. **Profile resolution**: Retrieve the matching `model_profiles` entry for the selected tool. Raise an error if it is missing.
3. **Input validation**: Validate against each tool's `inputSchema`.
4. **Responses invocation (attempt)**:
   - `model`: The profile's `model` value (for example `o3`, `gpt-4.1-mini`).
   - `instructions`: System Policy (described earlier).
   - `input`: User `query` plus optional hints such as recency/domains when needed.
   - `tools`: Always `[{"type":"web_search"}]` so web search remains available.
   - `text`: `{ "verbosity": <profile.verbosity> }` when supported by the model.
   - `reasoning`: `{ "effort": <profile.reasoning_effort> }` when supported by the model.
   - `timeout_ms`: Value from configuration.
5. **Annotation analysis**: Extract **URL / title / published_at** from `url_citation` annotations.
6. **Determine `used_search`** and **shape `citations`** (apply the configured maximum count).
7. **Construct response JSON** containing body, `used_search`, `citations[]`, and `model`.
8. **Return**: Store the JSON string in MCP response `content[0].text`.

---

### 6.1 Cancellation (MCP `notifications/cancelled`)

This server honors MCP cancellation notifications.

- Client notification (one-way)
  - `method`: `notifications/cancelled`
  - `params`: `{ requestId: string | number, reason?: string }`
  - No response body is needed because it is a notification.

- Server behavior
  - When `tools/call` starts, create and register an `AbortController` for the request `id` (`id -> controller`).
  - When a cancellation notification with a matching `requestId` arrives, call the registered `AbortController.abort()` and mark the request as interrupted.
  - For cancelled requests, stop sending subsequent `result`/`error` responses (discard late completions).
  - Ignore notifications for `requestId` values that are already finished or were never registered (this is normal).
  - `initialize` requests cannot be cancelled.

- OpenAI call linkage
  - Pass the `AbortSignal` to the OpenAI SDK (Responses API) call.
  - Before retrying, check `signal.aborted` and abort immediately if cancellation was requested (no further retries).

- Transport notes
  - Physical disconnections do not count as cancellation. Clients must explicitly send `notifications/cancelled` when they intend to cancel.

- Logging (DEBUG mode)
  - Emit minimal entries such as `cancelled requestId=<id> reason=<...>` without leaking content or secrets.

---

## 7. Retry Strategy
- Retry targets: HTTP 429 / 5xx / Abort (timeout)
- Strategy: Exponential backoff (timing at implementer's discretion, capped at `request.max_retries` attempts).
- Failure handling: Return as an error to `tools/call` (`code:-32050` etc., implementation-defined).

---

## 8. Security / Logging
- API keys are read **from ENV only**, not written to YAML/JSON.
- **Don't leave full response content or keys in logs**. Limit to minimal metadata (model name/latency/retry count).
- Follow your organization's security policies when using proxies or private gateways.

### 8.1 Debug Logging (Enablement and Single Determination)
- Purpose: Diagnose failures (model incompatibility, timeouts, 429/5xx, invalid arguments) without leaking content or sensitive data.
- Enablement sources (equivalent precedence: CLI > ENV > YAML)
  - CLI: `--debug` or `--debug <path>`
  - ENV: `DEBUG=1|true|<path>`
  - YAML: `server.debug: true` (optionally `server.debug_file: <path>`)
- Single determination: Resolve the final debug state (enabled/file location) once at startup, then rely on a shared helper (`isDebug()`). Individual modules must not consult `process.env` directly.
- Output policy: Write to stderr (TEE mirror to `<path>` when configured). Do not emit API keys, full response bodies, or instructions.
- Sample log lines:
  - server: `tools/call name=<tool> argsKeys=[...] queryLen=<n>`
  - answer: `profile=<name> model=<id> supports={verbosity:<bool>, reasoning:<bool>}`
  - answer: `request summary tools=web_search(<on/off>) reasoning=<on/off> text.verbosity=<on/off>`
  - openai(client): `error attempt=<n> status=<code> name=<err.name> code=<err.code> msg="..." body="<excerpt>"`
- Confidentiality guardrails:
  - Record only input length metadata such as `queryLen`; never log the actual `instructions` text.
  - Truncate response bodies to a few hundred characters and omit them entirely if sensitive content is suspected.

### 8.2 JSON-RPC Error Details (Debug Mode Only)
- Purpose: Provide minimal diagnostics when the client UI cannot display server stderr.
- When `tools/call` fails, include these fields inside `error.data`:
  - `message` (trimmed to about 400 characters)
  - `status` (HTTP status or SDK `code`)
  - `type` (API error type when available)
  - `name` (exception class)
- Confidentiality: Exclude any response content, instructions, or API keys; only metadata is permitted.

---

## 9. Language and Date Rules
- Answer in Japanese when the input is Japanese; answer in English otherwise.
- Convert relative dates (today/yesterday/tomorrow) to absolute `YYYY-MM-DD` dates using the Asia/Tokyo timezone.
- Include ISO-formatted dates with each citation whenever possible; if no publication date exists, provide the access date.

---

## 10. Definition of Done (DoD)
- Query "What does HTTP 404 mean?" returns `used_search=false` with an empty `citations` array.
- Query "Today's Tokyo weather for YYYY-MM-DD" returns `used_search=true` with at least one citation and includes URL plus ISO date in the body.
- `npm run mcp:smoke` produces three responses in order: `initialize -> tools/list -> tools/call(answer)`.

---

## 11. Compatibility Policy / Versioning
- Semantic Versioning rules:
  - Breaking changes -> **MAJOR**
  - Backward-compatible features -> **MINOR**
  - Bug fixes / dependency updates -> **PATCH**
- MCP protocol `protocolVersion` is currently **`2025-06-18`**. Future revisions must preserve backward compatibility and negotiate during `initialize`.

---

## 12. Reference Files (Part of Specification)
- `docs/reference/system-policy.md` - canonical instructions text (do not modify when quoting)
- `docs/reference/config-reference.md` - configuration schema and precedence details
- `config/config.yaml.example` - sample YAML configuration

---

## 13. Non-functional Requirements (Excerpt)
- **Stable operation**: Avoid beta/alpha builds and rely on official releases of the SDK/runtime.
- **Reproducibility**: Persist effective configurations with `--show-config` as described in `docs/reference/reproducibility.md`.
- **Security**: Keep secrets in environment variables only and minimize logging.

---

<!-- Future extensions (design only): Removed from public version due to undecided items -->

## 15. npm Distribution Metadata (package.json Publication Spec)
This section defines required and recommended `package.json` fields for npm publication. Verify compliance with this spec before releasing.

### 15.1 Required Fields
- name: `openai-responses-mcp`
- version: Semantic Versioning (current `0.4.x`)
- description: Use the following text (don't include stage expressions like "Step N:")
  - `Lightweight MCP server (Responses API core). OpenAI integration + web_search.`
- type: `module`
- bin: `{ "openai-responses-mcp": "build/index.js" }`
- files: `["build","config/config.yaml.example","config/policy.md.example","README.md","LICENSE"]`
- scripts.prepublishOnly: `npm run build`
- engines.node: `>=20`
- license: `MIT`

### 15.2 Recommended Metadata (npm Page Usability Enhancement)
- repository: `{ "type": "git", "url": "git+https://github.com/uchimanajet7/openai-responses-mcp.git" }`
- homepage: `https://github.com/uchimanajet7/openai-responses-mcp#readme`
- bugs: `{ "url": "https://github.com/uchimanajet7/openai-responses-mcp/issues" }`
- keywords: Supply relevant terms (for example `"mcp","openai","responses","cli"`)
- author: Provide appropriate attribution

### 15.3 Example `package.json` for Publication (Excerpt)
```json
{
  "name": "openai-responses-mcp",
  "version": "0.4.1",
  "description": "Lightweight MCP server (Responses API core). OpenAI integration + web_search.",
  "type": "module",
  "bin": { "openai-responses-mcp": "build/index.js" },
  "files": [
    "build",
    "config/config.yaml.example",
    "config/policy.md.example",
    "README.md",
    "LICENSE"
  ],
  "scripts": { "prepublishOnly": "npm run build" },
  "engines": { "node": ">=20" },
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/uchimanajet7/openai-responses-mcp.git" },
  "homepage": "https://github.com/uchimanajet7/openai-responses-mcp#readme",
  "bugs": { "url": "https://github.com/uchimanajet7/openai-responses-mcp/issues" }
}
```

### 15.4 Application and Verification Flow
1) Identify differences from spec (confirm no "Step N:" remains in `description`).
2) Ensure `repository`, `homepage`, and `bugs` fields match the URLs defined in this spec.
3) Verify included items and metadata with `npm run build:clean && npm pack --dry-run`.
4) Document reasons and impact in `docs/changelog.md` so users can track changes.

Note: This spec defines minimum requirements for public metadata; dependency and script details follow higher sections (functional spec).

---

## Appendix A. `answer` I/O Example
### A.1 Input (tools/call -> arguments)
```json
{
  "query": "Today's Tokyo weather on 2025-08-09?",
  "recency_days": 60,
  "max_results": 5,
  "domains": ["jma.go.jp","tenki.jp"],
  "style": "summary",
  "verbosity": "medium",
  "reasoning_effort": "minimal"
}
```

### A.2 Output (tools/call <- content[0].text)
```json
{
  "answer": "The Tokyo weather on 2025-08-09 (JST) is ...\n\nSources:\n- https://www.jma.go.jp/... (2025-08-09)",
  "used_search": true,
  "citations": [{"url":"https://www.jma.go.jp/...","title":"Japan Meteorological Agency Forecast","published_at":"2025-08-09"}],
  "model": "gpt-5"
}
```

---

## Appendix B. Error Examples (Implementation Guidance)
- Invalid input:
  ```json
  {"code":-32001,"message":"answer: invalid arguments","data":{"reason":"query is required"}}
  ```
- Missing profile configuration:
  ```json
  {"code":-32052,"message":"model_profiles.answer is required"}
  ```
- API error (429/5xx) after all retries fail:
  ```json
  {"code":-32050,"message":"openai responses failed","data":{"retries":3}}
  ```

## 16. Versioning / Changelog / Lockfile Policy

### 16.1 Versioning (SemVer / SSOT)
- The **single source of truth** for the version is `package.json` `version`.
- Breaking change = MAJOR, backward-compatible feature = MINOR, fix = PATCH.
- **Do not manually edit** `package-lock.json` versions; `npm install` reconciles them.
- Ensure the runtime satisfies `engines.node: "\>=20"`.

### 16.2 Changelog (Keep a Changelog Alignment)
- Location: `docs/changelog.md`.
- Format follows Keep a Changelog ordering (`Unreleased` -> released versions, newest first).
- Timezone: Asia/Tokyo.
- Category examples: Added / Changed / Fixed / Removed / Deprecated / Security.
- Pre-release (< v1.0.0): retain items under `Unreleased`, then convert to `vX.Y.Z - YYYY-MM-DD` when shipping.
- When confirming a release: move relevant entries from `Unreleased` into the dated section.

### 16.3 Lockfile Operations (npm lockfile v3)
- Always commit `package-lock.json` for reproducibility.
- Regenerate the lock from `package.json`; never hand-edit the lockfile.
- Preferred flows (most reproducible first):

  1) Clean re-resolution (recommended)
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```

  2) Quick re-resolution (minimal work)
  ```bash
  rm -f package-lock.json
  npm install
  ```

  3) Reproduce install from existing lock (no regeneration)
  ```bash
  npm ci
  ```

- CI and distribution assume lockfile v3 (recommend npm v9+ / Node 20+).

---

## 11. CI/CD Specification (GitHub Actions)
This section summarizes the operational rules captured in docs/release.md (phases B/C). Implementations must follow them exactly.

### 11.1 Branch/Tag Operations
- `main`: release branch.
- `feature/*`: feature branches prepared for PRs.
- Tags: use `vX.Y.Z` (SemVer) as the release trigger.
  - Decide the version manually, then `git tag vX.Y.Z` followed by `git push --tags`.

### 11.2 Workflow Structure
- `ci.yml` (PR/push verification)
  - Triggers: `pull_request` (all branches) and `push` (`main`).
  - Node: `20.x` (actions/setup-node@v4).
  - Steps:
    1) `actions/checkout@v4`
    2) `actions/setup-node@v4` (`node-version: 20`, `cache: npm`)
    3) `npm ci`
    4) `npm run build:clean`
    5) `npm pack --dry-run` (inspect bundled files)
    6) Smoke tests:
       - Default: `npm run mcp:smoke:ldjson` (no API key required)
       - Optional: `npm run mcp:smoke` (requires `OPENAI_API_KEY`)

- `release.yml` (tag push automation with Trusted Publishing)
  - Trigger: `push` with `tags: ["v*"]`
  - Permissions: `permissions: { contents: write, id-token: write }`
  - Node: `20.x`
  - Trusted Publishing / OIDC flow:
    - Register the repository with npm Trusted Publishers (one-time setup).
    - GitHub Actions executes `npm publish --provenance --access public` (no token needed).
  - Optional: generate GitHub Release notes.

### 11.3 Secrets / Environment Variables
- `OPENAI_API_KEY` (optional in ci.yml): required for `npm run mcp:smoke`; omit to run only `mcp:smoke:ldjson`.
- Trusted Publishing does not require `NPM_TOKEN`; configure npm once.

### 11.4 Reference YAML (Outline)
The snippets below illustrate the expected workflows. Mirror them without introducing additional steps.

ci.yml (outline):
```yaml
name: CI
on:
  pull_request:
  push:
    branches: ["main"]
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      # Run key-dependent tests only when the key is present.
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build:clean
      - run: npm pack --dry-run
      - run: npm run mcp:smoke:ldjson
      - if: env.OPENAI_API_KEY != ''
        run: npm run mcp:smoke
```

release.yml (outline - Trusted Publishing):
```yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: write
  id-token: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build:clean
      - run: npm publish --provenance --access public
```

### 11.5 Published Artifacts and Policy
- Publish only the minimal set listed in `package.json.files` (`build/`, `config/*.example`, `README.md`, `LICENSE`, `package.json`).
- Keep `prepublishOnly` as `npm run build` (local publish behaves the same).
- After release, verify with `npx openai-responses-mcp@latest --stdio`.

### 11.6 Operational Flow (Confirmed)
1) feature/* -> Pull Request (runs `ci.yml`).
2) Merge into `main`, bump `package.json` via SemVer.
3) `git tag vX.Y.Z && git push --tags` (runs `release.yml` -> npm publish via Trusted Publishing).
4) Confirm the Actions run succeeded and re-run the README `npx` example.

Note: Adding `repository`, `homepage`, and `bugs` fields to `package.json` improves the npm page, but coordinate separately before implementing.
