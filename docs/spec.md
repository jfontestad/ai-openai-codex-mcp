
# Canonical Specification — `docs/spec.md`
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
  # answer_quick is omitted → operates with answer configuration
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

#### 3.1.1 `answer` - Standard Response Tool (Baseline・Required)
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
- **Order convention (response body side)**: Main text → (if needed) bullet points → (only when web_search is used) `Sources:` with URLs + ISO dates.

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
1. **Tool determination**: MCP client selects from `answer`/`answer_detailed`/`answer_quick`.
2. **プロファイル決定**：選択されたツール名に対応する`model_profiles`設定を取得。未設定の場合はエラー。
3. **入力検証**: 各ツールのinputSchemaに従って検証。
4. **Responses 呼び出し（試行）**：
   - `model`: プロファイルの`model`値（例: `o3`, `gpt-4.1-mini`）
   - `instructions`: System Policy（前述）
   - `input`: User `query` (with additional hints for recency/domains if needed)
   - `tools`: `[{"type":"web_search"}]`（常時許可）
   - `text`: `{"verbosity": <profile.verbosity>}`（モデル対応時のみ）
   - `reasoning`: `{"effort": <profile.reasoning_effort>}`（モデル対応時のみ）
   - `timeout_ms`: 設定値
5. **Annotation analysis**: Extract **URL / title / published_at** from `url_citation` etc.
6. **`used_search` 判定** と **`citations` 整形**（最大件数適用）。
7. **応答 JSON 構築**（本文・`used_search`・`citations[]`・`model`）。
8. **Return**: Store as **JSON string** in MCP response `content[0].text`.

---

### 6.1 キャンセル（MCP notifications/cancelled）

本サーバーは MCP のキャンセル通知に対応する。

- クライアント通知（片方向）
  - `method`: `notifications/cancelled`
  - `params`: `{ requestId: string | number, reason?: string }`
  - 応答は不要（通知のため）。

- サーバー側の動作
  - `tools/call` 開始時に、該当 `id` に対する `AbortController` を作成して登録（`id → controller`）。
  - When cancellation notification (`requestId` matches) is received, call registered `AbortController.abort()` and set interruption flag.
  - 中断済みの要求については、以後その `id` に対する `result`/`error` の送信を抑止する（遅延完了は破棄）。
  - 既に完了・未登録の `requestId` に対する通知は無視する（正常）。
  - `initialize` はキャンセル不可。

- OpenAI 呼び出しとの連携
  - `AbortSignal` を OpenAI SDK（Responses API）呼び出しに伝搬する。
  - Check `signal.aborted` before retry, and immediately interrupt on cancellation (no retries).

- トランスポート注意
  - Physical disconnection does not imply cancellation. When cancellation is intended, client must always send `notifications/cancelled`.

- ログ（DEBUG 時）
  - Record `cancelled requestId=<id> reason=<...>` minimally (no main content or secret information).

---

## 7. Retry Strategy
- Retry targets: HTTP 429 / 5xx / Abort (timeout)
- 戦略：指数バックオフ（実装裁量、合計 `request.max_retries` 回まで）
- Failure handling: Return as error to `tools/call` (`code:-32050` etc., implementation-defined).

---

## 8. Security / Logging
- API keys are read **from ENV only**, not written to YAML/JSON.
- **Don't leave full response content or keys in logs**. Limit to minimal metadata (model name/latency/retry count).
- プロキシ・私設ゲートウェイ利用は組織方針に従う。

### 8.1 デバッグログ（有効条件と単一判定）
- Purpose: Identify failure causes (model incompatibility, timeout, 429/5xx, invalid arguments) without exposing content or confidential information.
- 有効化の入力源（同義、優先度：CLI > ENV > YAML）
  - CLI: `--debug` または `--debug <path>`
  - ENV: `DEBUG=1|true|<path>`
  - YAML: `server.debug: true`（任意で `server.debug_file: <path>`）
- Single determination: Determine final state (enabled/file) once at app startup, then use common function for subsequent checks (`isDebug()`). Modules don't reference `process.env` individually.
- Output policy: Output to stderr (with TEE mirror to `<path>` as needed). Don't output API keys, content, or instructions.
- 出力内容（例）：
  - server: `tools/call name=<tool> argsKeys=[...] queryLen=<n>`
  - answer: `profile=<name> model=<id> supports={verbosity:<bool>, reasoning:<bool>}`
  - answer: `request summary tools=web_search(<on/off>) reasoning=<on/off> text.verbosity=<on/off>`
  - openai(client): `error attempt=<n> status=<code> name=<err.name> code=<err.code> msg="..." body="<先頭抜粋>"`
- 機密対策：
  - Record only content length (`queryLen`). Don't output `instructions`.
  - Round response body to first few hundred characters, assuming no URLs/keys included. Suppress output if questionable.

### 8.2 エラー詳細の JSON-RPC 返却（DEBUG=1 または `--debug` 時のみ）
- Purpose: Visualize minimal diagnostic information when client UI can't capture server stderr.
- When `tools/call` fails, include the following in `error` `data`:
  - `message` (rounded to ~400 characters)
  - `status` (HTTP status or SDK `code`)
  - `type` (API error type when available)
  - `name`（例外名）
- Confidentiality measure: Don't include content, instructions, or API keys. Only minimal metadata.

---

## 9. Multilingual & Date Rules
- 日本語入力→日本語応答。英語入力→英語応答。
- 相対日付（今日/昨日/明日）は **Asia/Tokyo** で**絶対日付**化（`YYYY-MM-DD`）。
- Sources should include ISO dates whenever possible (use **access date** when publication date unavailable).

---

## 10. Definition of Done (DoD)
- 「HTTP 404 の意味」は `used_search=false`、`citations=[]` で返る。
- 「本日 YYYY-MM-DD の東京の天気」は `used_search=true`、`citations.length>=1`、本文に URL + ISO 日付併記。
- `npm run mcp:smoke` returns 3 responses: `initialize → tools/list → tools/call(answer)`.

---

## 11. Compatibility Policy / Versioning
- セマンティックバージョニング：
  - 破壊的変更 → **MAJOR**
  - 新機能追加（後方互換）→ **MINOR**
  - バグ修正/依存更新 → **PATCH**
- MCP プロトコル `protocolVersion` は現行 **`2025-06-18`**。将来の変更は後方互換を維持し、`initialize` でネゴシエーション。

---

## 12. Reference Files (Part of Specification)
- `docs/reference/system-policy.md` — **Instructions 本文**（貼付用・改変禁止）
- `docs/reference/config-reference.md` — 設定スキーマと優先順位の詳細
- `config/config.yaml.example` — 設定例（YAML）

---

## 13. Non-functional Requirements (Excerpt)
- **Stable operation**: Avoid beta/alpha, use only **official releases** of SDK/runtime (npm/Node).
- **再現性**：`--show-config` による実効設定の保存を推奨（`docs/reference/reproducibility.md`）。
- **セキュリティ**：秘密は ENV のみ、ログ最小化。

---

<!-- Future extensions (design only): Removed from public version due to undecided items -->

## 15. npm Distribution Metadata (package.json Publication Spec)
本セクションは npm 公開時の `package.json` の必須/推奨項目を定義する。公開前には本仕様と一致していることを確認すること。

### 15.1 必須項目
- name: `openai-responses-mcp`
- version: セマンティックバージョニング（現行 `0.4.x`）
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
- keywords: 適宜（例: `"mcp","openai","responses","cli"`）
- author: 適宜

### 15.3 公開用 `package.json` 例（抜粋）
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

### 15.4 適用・検証フロー
1) Identify differences from spec (confirm no "Step N:" remains in `description`).
2) `repository/homepage/bugs` を本仕様のURLで追加。
3) Verify included items and metadata with `npm run build:clean && npm pack --dry-run`.
4) 変更理由と影響範囲を `docs/changelog.md` に追記（ユーザー可視）。

Note: This spec defines minimum requirements for public metadata; dependency and script details follow higher sections (functional spec).

---

## 付録 A. `answer` の I/O 例
### A.1 入力（tools/call → arguments）
```json
{
  "query": "本日 2025-08-09 の東京の天気は？",
  "recency_days": 60,
  "max_results": 5,
  "domains": ["jma.go.jp","tenki.jp"],
  "style": "summary",
  "verbosity": "medium",
  "reasoning_effort": "minimal"
}
```

### A.2 出力（tools/call ← content[0].text）
```json
{
  "answer": "2025-08-09（JST）の東京都の天気は……（略）。\n\nSources:\n- https://www.jma.go.jp/... (2025-08-09)",
  "used_search": true,
  "citations": [{"url":"https://www.jma.go.jp/...","title":"気象庁｜天気予報","published_at":"2025-08-09"}],
  "model": "gpt-5"
}
```

---

## 付録 B. エラー例（実装指針）
- 入力不備：
  ```json
  {"code":-32001,"message":"answer: invalid arguments","data":{"reason":"query is required"}}
  ```
- プロファイル未設定：
  ```json
  {"code":-32052,"message":"model_profiles.answer is required"}
  ```
- API エラー（429/5xx）：指数バックオフ後も失敗した場合：
  ```json
  {"code":-32050,"message":"openai responses failed","data":{"retries":3}}
  ```

## 16. バージョニング / Changelog / Lockfile 運用方針

### 16.1 バージョニング（SemVer / SSOT）
- バージョンの**唯一の出所（SSOT）**は `package.json` の `version`。
- 破壊的変更=MAJOR、後方互換の機能追加=MINOR、修正=PATCH。
- **Don't manually rewrite** `version` in `package-lock.json` (`npm install` auto-reconciles).
- Node は `engines.node: ">=20"` を満たすこと。

### 16.2 Changelog（Keep a Changelog 準拠）
- 位置: `docs/changelog.md`。
- 形式: Keep a Changelog 準拠。セクション順は `Unreleased` → 過去リリース（新しい順）。
- Timezone: Dates are Asia/Tokyo.
- 区分例: Added / Changed / Fixed / Removed / Deprecated / Security。
- プレリリース期間（〜v1.0.0）: `Unreleased` に集約し、必要時に `vx.y.z — YYYY-MM-DD` として確定。
- When release confirmed: Extract relevant diff from `Unreleased` and create new section with date.

### 16.3 Lockfile 運用（npm lockfile v3）
- `package-lock.json` は**VCS にコミット**する（再現性のため）。
- Regeneration uses **`package.json` as source**. Manual lock editing prohibited.
- Generation/regeneration procedures (ordered by reproducibility priority):

  1) クリーン再解決（推奨）
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

- CI/配布: lockfile v3 を前提（npm v9+ / Node 20+ を推奨）。

以上。

---

## 11. CI/CD 仕様（GitHub Actions）
本節は docs/release.md（フェーズB/C）の運用方針を正準仕様としてまとめたもの。実装時は本仕様に完全準拠する。

### 11.1 Branch/Tag Operations
- `main`: リリース対象ブランチ。
- `feature/*`: 機能開発ブランチ（PR前提）。
- Tags: Use only `vX.Y.Z` format as release trigger (SemVer).
  - バージョンの決定は手動で `package.json` を bump → `git tag vX.Y.Z` → `git push --tags`。

### 11.2 ワークフロー構成
- `ci.yml`（PR/Push 検証）
  - トリガ: `pull_request`（全ブランチ）/ `push`（`main`）。
  - Node: `20.x`（actions/setup-node@v4）。
  - 手順:
    1) `actions/checkout@v4`
    2) `actions/setup-node@v4`（`node-version: 20`, `cache: npm`）
    3) `npm ci`
    4) `npm run build:clean`
    5) `npm pack --dry-run`（同梱物確認）
    6) スモークテスト:
       - 既定: `npm run mcp:smoke:ldjson`（OpenAI鍵不要）
       - 任意: `npm run mcp:smoke`（`OPENAI_API_KEY` を設定した場合のみ実行）

- `release.yml` (tag push: auto-release — adopts Trusted Publishing)
  - トリガ: `push` with `tags: ["v*"]`
  - 権限: `permissions: { contents: write, id-token: write }`
  - Node: `20.x`
  - npm 公開設定（Trusted Publishing / OIDC）:
    - npmjs 側で当該 GitHub リポジトリを Trusted Publishers に登録（初回のみ）
    - Actions 側は `npm publish --provenance --access public` を実行（トークン不要）
  - 任意: GitHub Release ノート生成

### 11.3 シークレット/環境変数
- `OPENAI_API_KEY`（任意・ci.yml）: `npm run mcp:smoke` 実行時に必要。未設定の場合は `mcp:smoke:ldjson` のみ実行。
- Trusted Publishing では `NPM_TOKEN` は不要。npmjs 側で Trusted Publishers を設定する。

### 11.4 参考 YAML（概要）
The following is the implementation framework (during implementation, faithfully reflect this specification without adding duplicates or extra steps).

ci.yml（概要）:
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
      # Run key-dependent tests only when key is available, so bind to job env.
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

release.yml（概要 — Trusted Publishing）:
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

### 11.5 成果物と公開ポリシー
- `package.json.files` に指定された最小セットのみを公開（`build/`, `config/*.example`, `README.md`, `LICENSE`, `package.json`）。
- `prepublishOnly`: Retain `npm run build` (local publish has same behavior).
- 公開後の検証: `npx openai-responses-mcp@latest --stdio` で起動確認。

### 11.6 運用フロー（再掲・確定）
1) feature/* → Pull Request（`ci.yml` 実行）
2) `main` にマージ後、`package.json` を semver で bump
3) `git tag vX.Y.Z && git push --tags`（`release.yml` 実行 → npm publish（Trusted Publishing））
4) Actions の成功確認 → README の npx 例で動作確認

Note: Adding `repository`/`homepage`/`bugs` to `package.json` is recommended for npm page display improvement, but implementation should be done separately with agreement.
