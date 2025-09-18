
# Transports — `docs/reference/transports.md`
Last Updated: 2025-08-15 (Asia/Tokyo, AI verified)

This document describes the transport specifications implemented by **openai-responses-mcp**.
Currently only **stdio** is implemented.

---

## 1. stdio (Implemented)

### 1.1 Physical Layer
- **Bidirectional**: Uses process `stdin`/`stdout` (binary not supported, **UTF-8** text).
- **Framing (preferred)**: `Content-Length: <n>\r\n\r\n<payload>` fixed header. Multiple messages can be concatenated.
- **Compatibility mode (fallback)**: If client doesn't send Content-Length, **line-delimited JSON (NDJSON-style)** is also accepted. If line mode is detected on receive, subsequent server responses are also returned as **JSON + `\n`**.
- **Payload**: `application/json; charset=utf-8`. Newlines are optional (`\n` recommended).
- **Encoding**: UTF-8. BOM not allowed.

### 1.2 JSON-RPC Compatibility
- **Version**: `"jsonrpc":"2.0"` (compatible).
- **Methods**: Uses `initialize` / `tools/list` / `tools/call` / `ping` (`ping` is optional health check).
- **ID**: Both numbers and strings are acceptable. Match between request and response.

### 1.3 Initialization
**Received (Example)**
```http
Content-Length: 118

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}
```
**Sent (Example)**
```http
Content-Length: 142

{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"openai-responses-mcp","version":"<pkg.version>"}}}
```

### 1.4 Tool List
**Received (Example)**
```http
Content-Length: 52

{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```
**Sent (Example - answer only)**
```http
Content-Length: 458

{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"answer","description":"Performs web search as needed and returns answers with evidence (including citations)","inputSchema":{"type":"object","properties":{"query":{"type":"string"},"recency_days":{"type":"number"},"max_results":{"type":"number"},"domains":{"type":"array","items":{"type":"string"}},"style":{"enum":["summary","bullets","citations-only"]}},"required":["query"]}}]}} 
```

### 1.5 Tool Call (answer)
**Received (Example)**
```http
Content-Length: 156

{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"answer","arguments":{"query":"HTTP 404 の意味は？","style":"summary"}}}
```
**Sent (Example - Success)**
```http
Content-Length: 204

{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"answer\":\"...\",\"used_search\":false,\"citations\":[],\"model\":\"gpt-5\"}"}]}}
```

**Sent (Example - Error)**
```http
Content-Length: 128

{"jsonrpc":"2.0","id":3,"error":{"code":-32001,"message":"answer: invalid arguments","data":{"reason":"query is required"}}}
```

### 1.6 ping (Optional Health Check)
**Received (Example)**
```http
Content-Length: 36

{"jsonrpc":"2.0","id":99,"method":"ping"}
```
**Sent (Example)**
```http
Content-Length: 28

{"jsonrpc":"2.0","id":99,"result":{}}
```

### 1.7 Implementation Notes
- **Content-Length is calculated in UTF-8 byte length** (`Buffer.byteLength(json, 'utf8')`).
- Streams are not delivered to client until **flushed**. No need for `\n` immediately after `stdout.write`, but don't forget the `\r\n\r\n` at the end of headers.
- **Backpressure**: When Node.js `stdout.write()` returns `false`, wait for `drain`.
- **Maximum message length**: No limit, but consider splitting at 1-2MB in practice.
- **Concurrent requests**: Can proceed simultaneously using ID as key. Allow out-of-order responses.

### 1.8 Logging & Troubleshooting
- **Debug mode**: Enabled by unified judgment of CLI/ENV/YAML (priority: CLI > ENV > YAML). Follows a single judgment (`isDebug()`) determined at startup, outputting step-by-step logs to stderr (e.g., `stdin chunk=...` / `headerEnd=...` / `recv method=...` / `send (line|framed) bytes=...` / `send json=...`).
- **Typical framing issues**: `Content-Length` mismatch, missing `\r\n\r\n`, BOM contamination. Also automatic fallback to line-delimited JSON.
- **Testing**: Use `npm run mcp:smoke` to verify 3 responses: `initialize → tools/list → tools/call`.

---

<!-- HTTP（streamable_http）に関する設計案は docs/_drafts/transports-http.md へ退避 -->

## 3. Compatibility Policy
- `protocolVersion` is currently `2025-06-18`. For future changes, negotiate in `initialize` for **backward compatibility**.
- `tools` schema additions are **premised on backward compatibility** (deletion/semantic changes of required fields not allowed).

---

## 4. Testing (Transport-level)
- **stdio**: `scripts/mcp-smoke.js` provides minimal testing. Confirms success of `initialize`→`tools/list`→`tools/call`.
