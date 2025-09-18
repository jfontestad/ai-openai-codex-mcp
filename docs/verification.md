
# Verification Procedures (E2E) — openai-responses-mcp

Last Updated: 2025-08-15 (Asia/Tokyo, AI verified)
This file shows local reproduction and verification procedures. Output prioritizes forms that allow **machine inspection of JSON**, with `jq` verification examples also included.

---

## 0. Prerequisites
- Node.js 20 or higher (e.g., v24 series), npm
- Dependencies and build (reproducibility focused):
  ```bash
  npm ci
  npm run build
  ```
- Note: Some verification steps that actually call OpenAI API require `OPENAI_API_KEY`.

---

## 1. Sanity Check (CLI)
### 1-1 Version and Help
```bash
node build/index.js --version
node build/index.js --help
```

### 1-2 Effective Configuration (Priority: CLI > ENV > YAML > TS)
```bash
# Raw state
node build/index.js --show-config 2> effective.json; cat effective.json | jq '.version, .sources, .effective.model_profiles.answer.model'
```
**Expected**: Contains `sources.ts_defaults=true`, and `effective.model_profiles.answer.model` is default (`gpt-5-mini`).

---

## 2. MCP stdio Smoke Test (LDJSON, no API key required)
```bash
npm run mcp:smoke:ldjson | tee /tmp/mcp-smoke-ldjson.out

# initialize and tools/list responses should be output as JSON lines
grep -c '"jsonrpc":"2.0"' /tmp/mcp-smoke-ldjson.out
```
**Expected**: `initialize` and `tools/list` responses are obtained (no OpenAI API calls made).

### 2-1 Additional: ping verification (no API key required, immediate termination)
```bash
npm run mcp:smoke:ping | tee /tmp/mcp-smoke-ping.out

# ping result should return empty object
grep -c '"result":{}' /tmp/mcp-smoke-ping.out
```
**Expected**: After `initialize` response, `{"jsonrpc":"2.0","id":<n>,"result":{}}` should be output.

### 2-2 追加: protocol/capabilities の目視確認
- `protocolVersion` should be `2025-06-18`
- `initialize` response `capabilities` should be `{"tools":{}}` only (`roots` not included)

---

## 3. MCP stdio スモーク（Content-Length, 要 OPENAI_API_KEY）
Minimal connectivity that actually calls OpenAI API. `scripts/mcp-smoke.js` sends `tools/call(answer)` so key is required.
```bash
export OPENAI_API_KEY="sk-..."
npm run mcp:smoke | tee /tmp/mcp-smoke.out

# Verify that 3 responses (initialize → tools/list → tools/call) flow with Content-Length
grep -c '^Content-Length:' /tmp/mcp-smoke.out
```

---

## 4. 優先順位の検証（ENV > YAML > TS）
### 4-1 ENV 上書き
```bash
MODEL_ANSWER="gpt-5-mini" node build/index.js --show-config 2> effective.json; cat effective.json | jq '.effective.model_profiles.answer.model'
```
**期待**: `"gpt-5-mini"`

### 4-2 YAML の読み込み
```bash
cat > /tmp/mcp-config.yaml <<'YAML'
model_profiles:
  answer:
    model: gpt-5-mini
    reasoning_effort: medium
    verbosity: medium
YAML

node build/index.js --show-config --config /tmp/mcp-config.yaml 2> effective.json; cat effective.json | jq '.sources, .effective.model_profiles.answer.model'
```
**期待**: `.sources.yaml` が `/tmp/mcp-config.yaml` を指し、`"gpt-5-mini"`。

---

## 5. タイムアウト/リトライ観察（任意, 要 OPENAI_API_KEY）
API 側の都合により再現しづらい場合がありますが、`OPENAI_API_TIMEOUT` を小さくして Abort → リトライを観察できます。
```bash
export OPENAI_API_KEY="sk-..."
OPENAI_API_TIMEOUT=10 npm run mcp:smoke | sed -n '1,120p'
```
（ログにリトライ回数が出る構成にしている場合は、その値を確認してください）

---

## 6. 失敗時の切り分け
- `Missing API key: set OPENAI_API_KEY` → 環境変数未設定
- `ECONNRESET` / `AbortError` → ネットワーク/タイムアウト
- `Unknown tool` → `tools/call` の name ミス（`answer` のみ対応）

---

## 7. 成功判定（DoD 準拠）
- 1・2・4 の各検証が**期待どおり**になれば要件を満たしています。

---

## 8. キャンセル（notifications/cancelled）の自動テスト

### 8-1 inflightなしのキャンセル（API鍵不要・常時実行）
```bash
npm run build
node scripts/test-cancel-noinflight.js
```
**期待**: `initialize` と `ping` の応答が成功し、テストは exit 0。

### 8-2 実行中キャンセルの抑止（要 OPENAI_API_KEY・任意）
```bash
export OPENAI_API_KEY="sk-..."
npm run build
node scripts/test-cancel-during-call.js
```
**期待**: キャンセル後に `id:3` の `result/error` は出ず、テストは `[test] OK: no response for id=3 after cancel` を表示して exit 0。

備考: GitHub Actions（`ci.yml`）では、APIキー未設定時は 8-2 を自動スキップする。

---

## 9. tools/list のツール定義検証（API鍵不要・常時実行）
```bash
npm run build
node scripts/test-tools-list.js
```
**期待**: `answer` / `answer_detailed` / `answer_quick` の3ツールが含まれる。テストは exit 0。
