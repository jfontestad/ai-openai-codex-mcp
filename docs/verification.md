
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

### 2-2 Additional: Visual Confirmation of protocol/capabilities
- `protocolVersion` should be `2025-06-18`
- `initialize` response `capabilities` should be `{"tools":{}}` only (`roots` not included)

---

## 3. MCP stdio Smoke Test (Content-Length, requires OPENAI_API_KEY)
Minimal connectivity that actually calls OpenAI API. `scripts/mcp-smoke.js` sends `tools/call(answer)` so key is required.
```bash
export OPENAI_API_KEY="sk-..."
npm run mcp:smoke | tee /tmp/mcp-smoke.out

# Verify that 3 responses (initialize → tools/list → tools/call) flow with Content-Length
grep -c '^Content-Length:' /tmp/mcp-smoke.out
```

---

## 4. Priority Verification (ENV > YAML > TS)
### 4-1 ENV Override
```bash
MODEL_ANSWER="gpt-5-mini" node build/index.js --show-config 2> effective.json; cat effective.json | jq '.effective.model_profiles.answer.model'
```
**Expected**: `"gpt-5-mini"`

### 4-2 YAML Loading
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
**Expected**: `.sources.yaml` points to `/tmp/mcp-config.yaml` and shows `"gpt-5-mini"`.

---

## 5. Timeout/Retry Observation (Optional, requires OPENAI_API_KEY)
Due to API-side circumstances, reproduction may be difficult, but you can observe Abort → retry by reducing `OPENAI_API_TIMEOUT`.
```bash
export OPENAI_API_KEY="sk-..."
OPENAI_API_TIMEOUT=10 npm run mcp:smoke | sed -n '1,120p'
```
(If your configuration logs retry counts, verify that value)

---

## 6. Failure Troubleshooting
- `Missing API key: set OPENAI_API_KEY` → Environment variable not set
- `ECONNRESET` / `AbortError` → Network/timeout
- `Unknown tool` → `tools/call` name error (only `answer` supported)

---

## 7. Success Criteria (DoD Based)
- If verifications 1, 2, and 4 show **expected results**, requirements are met.

---

## 8. Automatic Testing of Cancellation (notifications/cancelled)

### 8-1 Cancellation without inflight (No API key required, always run)
```bash
npm run build
node scripts/test-cancel-noinflight.js
```
**Expected**: `initialize` and `ping` responses succeed, test exits 0.

### 8-2 Suppression of In-Flight Cancellation (requires OPENAI_API_KEY, optional)
```bash
export OPENAI_API_KEY="sk-..."
npm run build
node scripts/test-cancel-during-call.js
```
**Expected**: After cancellation, no `result/error` for `id:3` appears, test displays `[test] OK: no response for id=3 after cancel` and exits 0.

Note: GitHub Actions (`ci.yml`) automatically skips 8-2 when API key is not set.

---

## 9. Tool Definition Verification for tools/list (No API key required, always run)
```bash
npm run build
node scripts/test-tools-list.js
```
**Expected**: Contains 3 tools: `answer` / `answer_detailed` / `answer_quick`. Test exits 0.
