
# Claude Code / Claude Desktop Integration Guide - `docs/reference/client-setup-claude.md`
Last Updated: 2025-08-09 (Asia/Tokyo)

This document provides complete step-by-step instructions for registering and using **openai-responses-mcp** (stdio) with Claude clients.
**No summary provided**. Since client-specific configuration file locations change with versions,
this document strictly describes **configuration formats and verification procedures**.

---

## 1. Prerequisites (Server Side)
- Node.js 20+, npm.
- OpenAI API key prepared as **environment variable** (e.g., `OPENAI_API_KEY`).

---

## 2. MCP Server Registration in Claude Clients (Common Format)
Claude-family clients (Claude Code / Claude Desktop) commonly register servers using a **`mcpServers`**
map structure. **Open the configuration file from the client UI (Settings -> Developer) to find the exact location**.
Do not specify paths directly - **always edit the file opened through the UI**.

### 2.1 Configuration Example (Minimal/Recommended; local path)
```json
{
  "mcpServers": {
    "openai-responses": {
      "command": "node",
      "args": ["/ABS/PATH/openai-responses-mcp/build/index.js", "--stdio"],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```
> If you configure `model_profiles` in YAML (`~/.config/openai-responses-mcp/config.yaml`), those settings will be applied.

### 2.2 Profile Configuration (YAML)
Write the following in `~/.config/openai-responses-mcp/config.yaml`.
```yaml
model_profiles:
  answer:
    model: gpt-5
    reasoning_effort: medium
    verbosity: medium
  answer_detailed:
    model: gpt-5
    reasoning_effort: high
    verbosity: high
  answer_quick:
    model: gpt-5-mini
    reasoning_effort: low
    verbosity: low
```
- **`--stdio` is mandatory** (Claude startup uses stdio).
- **Required environment variable**: `OPENAI_API_KEY`.
- **Security**: Pass API keys via ENV. Do not write sensitive information in YAML.

### 2.3 Remote Execution Example (via SSH)
```json
{
  "mcpServers": {
    "openai-responses-remote": {
      "command": "ssh",
      "args": [
        "my-host.example.com",
        "node", "/ABS/PATH/openai-responses-mcp/build/index.js", "--stdio"
      ],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```
> For SSH execution, **Node and built files must be available on the remote host**. Set up keys/connection configuration on the OS side.

---

## 2.4 Environment Variables (Minimum Required)
| Environment Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | [OK] | OpenAI API key |

---

## 3. Restart and Application
- After saving the configuration file, **completely exit Claude client -> restart**.
- On startup, the MCP server will launch and **initialize -> tools/list** will be sent.

---

## 4. Operation Verification (Client-Side Observation)
- Open the client's **developer logs/developer tools** (accessed through the UI).
- The following 3 messages should appear with **Content-Length** headers:
  1) `initialize` (client -> server)
  2) `tools/list` (client -> server)
  3) `result` (server -> client; tool list should contain 3 tools)

**Expected Value (Example)**
```http
Content-Length: 157

{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"openai-responses-mcp","version":"0.4.0"}}}
```
If the `tools` section displays the 3 tools: `answer`, `answer_detailed`, and `answer_quick`, registration was successful.

---

## 5. Practical Testing (Using from Claude)
- Give Claude instructions as usual. For **time-sensitive questions** (e.g., "Today's Tokyo weather for YYYY-MM-DD"),
  when the model determines `web_search` is needed, **the MCP server's `answer` will be called**, returning a response with external sources.
- **Stable knowledge questions** (e.g., meaning of HTTP 404) will not use `web_search` and will answer without `citations`.

> If the client's prompt policy specifies "always call MCP `answer` on errors", etc.,
> `answer` will be automatically triggered according to that rule.

---

## 6. Troubleshooting
- **Nothing displays**: Path is relative/incorrect. Specify **absolute path**. Insufficient execution permissions (including Windows extension issues).
- **API key not set**: `Missing API key: set OPENAI_API_KEY`. Pass the value in the configuration file's `env` section.
- **Framing error**: `Content-Length` mismatch. Rebuild (`npm run build`).
- **Timeout/429**: Network congestion or API-side issues. Automatic retry & fallback will be activated.

---

## 7. Security / Operations
- Do not **save full logs** of keys or response content. Record only the minimum necessary metadata.
- In high-security environments, **remote execution via SSH** is possible to avoid leaving keys locally.

---

## 8. Removal / Rollback
- Remove the corresponding entry from the configuration file and restart the client.
- For temporary disabling, **entry removal** is recommended rather than replacing `command` with an invalid command.
