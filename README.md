# openai-responses-mcp

<div align="center">
  <p><a href="./README.en.md">English</a></p>
</div>

A lightweight MCP server that adopts OpenAI Responses API as its reasoning core.  
Always allows `web_search`, letting the model autonomously decide whether to perform searches. Use from MCP clients like Claude Code/Claude Desktop via stdio.

Important: The canonical specification is `docs/spec.md`. Please refer to it for details.

---

## Repository Structure
- `src/`                         : TypeScript sources
- `scripts/`                     : Verification/utility scripts (`mcp-smoke*`, `clean.js`, etc.)
- `config/`
  - `config.yaml.example`        : Configuration sample
  - `policy.md.example`          : External System Policy sample
- `docs/`                        : Canonical specification/reference/verification procedures
  - `spec.md`                    : Canonical specification
  - `reference/`                 : Configuration, setup, integration references
  - `verification.md`            : E2E verification procedures
- `README.md`                    : Project overview/quick start
- `LICENSE`                      : License
- `package.json`, `package-lock.json` : npm configuration/dependency lock
- `tsconfig.json`                : TypeScript configuration
- `.gitignore`                   : Git exclusion settings

---

## Features (Overview)
- Responses API compliant (official JS SDK `openai`)
- Search delegated to model (`web_search` always allowed)
- Structured output (text, `used_search`, `citations[]`, `model`)
- System Policy is code-side SSOT (`src/policy/system-policy.ts`)
- MCP stdio implementation (`initialize`/`tools/list`/`tools/call`)

## Requirements
- Node.js v20 or higher (recommended: v24)
- npm (bundled with Node)
- OpenAI API key (pass via environment variable)

---

## Minimal Setup (Start with Required Settings Only)
- Required setting: Environment variable `OPENAI_API_KEY` only (YAML not needed)
- Startup example (npx):
  - `export OPENAI_API_KEY="sk-..." && npx openai-responses-mcp@latest --stdio`

YAML can be added later (default path: macOS/Linux `~/.config/openai-responses-mcp/config.yaml`, Windows `%APPDATA%\\openai-responses-mcp\\config.yaml`).

---

## For Users (Using as MCP)
Please refer to this when using from MCP clients.

### 1) Example registration with Claude Code
- Add the following item to `~/.claude.json`

```json
{
  "mcpServers": {
    "openai-responses": {
      "command": "npx",
      "args": ["openai-responses-mcp@latest", "--stdio"],
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

- `claude code cli` で以下を実行

```sh
claude mcp add -s user -t stdio openai-responses -e OPENAI_API_KEY=sk-xxxx -- npx openai-responses-mcp@latest --stdio
```

### 2) Example registration with OpenAI Codex
- Add the following item to `~/.codex/config.toml`

```toml
[mcp_servers.openai-responses]
command = "npx"
args = ["-y", "openai-responses-mcp@latest", "--stdio"]
env = { OPENAI_API_KEY = "sk-xxxx" }
```

### 3) Instruction examples for CLAUDE.md or AGENTS.md
```markdown
### Problem-solving Policy

When encountering problems or implementation difficulties during development:

1. **Always consult openai-responses MCP**  
   - Consultation is the highest priority and mandatory  
   - Never implement based on independent judgment  

2. **Always ask questions in English**  
   - All questions to openai-responses MCP should be written in English  

3. **Research alternative methods and latest best practices**  
   - Use openai-responses MCP to collect solution methods and latest best practices  

4. **Consider multiple solution approaches**  
   - Do not immediately decide on one method; compare multiple options before deciding on a policy  

5. **Document solutions**  
   - After problem resolution, record procedures and solutions for quick response to recurrences  
```

### 4) Direct execution with npx
```bash
export OPENAI_API_KEY="sk-..." 
npx openai-responses-mcp@latest --stdio --debug ./_debug.log --config ~/.config/openai-responses-mcp/config.yaml
```

### 5) Configuration (YAML optional)
Default path: macOS/Linux `~/.config/openai-responses-mcp/config.yaml`, Windows `%APPDATA%\openai-responses-mcp\config.yaml`

最小例:

```yaml
model_profiles:
  answer:
    model: gpt-5
    reasoning_effort: medium
    verbosity: medium

request:
  timeout_ms: 300000
  max_retries: 3
```
サンプル: `config/config.yaml.example`

外部 policy（任意）:

```yaml
policy:
  system:
    source: file
    path: ~/.config/openai-responses-mcp/policy.md
    merge: append   # replace | prepend | append
```
サンプル: `config/policy.md.example`

### 6) Logging and Debug
- デバッグON（画面出力）: `--debug` / `DEBUG=1|true` / YAML `server.debug: true`（優先度: CLI > ENV > YAML, 単一判定）
- デバッグON（ファイル＋画面ミラー）: `--debug ./_debug.log` または `DEBUG=./_debug.log`
- デバッグOFF: 最小限の稼働確認ログのみ

補足（YAMLでの制御）:
- `server.debug: true|false`（YAMLのみでも全モジュールに反映）
- `server.debug_file: <path|null>`（指定時は stderr をファイルへTEEミラー）

---

## For Developers (Clone and Develop)

### 1) 取得とビルド
```bash
git clone https://github.com/<your-org>/openai-responses-mcp.git
cd openai-responses-mcp
npm i
npm run build
```

### 2) スモークテスト（MCPフレーミング）
```bash
npm run mcp:smoke | tee /tmp/mcp-smoke.out
grep -c '^Content-Length:' /tmp/mcp-smoke.out   # 3 以上でOK
```

### 3) ローカル起動（stdio）
```bash
export OPENAI_API_KEY="sk-..."
node build/index.js --stdio --debug ./_debug.log
```

### 4) デモ（OpenAIへの問い合わせサンプル）
```bash
npm run mcp:quick -- "今日の東京の気温"
npm run mcp:smoke:ldjson   # NDJSON互換の疎通確認
```

### 5) ドキュメント（参照先）
- 正準仕様: `docs/spec.md`
- リファレンス: `docs/reference/config-reference.md` / `docs/reference/client-setup-claude.md`
- 検証手順: `docs/verification.md`

---

## For Maintainers (Distribution)

### npm パッケージ確認と公開
```bash
npm pack --dry-run    # 同梱物を確認（build/ と README/LICENSE/サンプルのみ）
npm publish           # 公開（スコープなし）
```

---

## Troubleshooting (Key Points)
- `Missing API key`: `OPENAI_API_KEY` 未設定。ENV を見直し
- `Cannot find module build/index.js`: ビルド未実行 → `npm run build`
- フレーミング不一致: `npm run mcp:smoke` で確認し再ビルド
- 429/5xx 多発: `request.max_retries`/`timeout_ms` を調整（YAML）

---

## License
MIT

## Notes

<p><a href="https://uchimanajet7.hatenablog.com/entry/2025/08/21/203000
">openai-responses-mcp 開発メモ - Codex と Claude Code を両方使って作ってみた
</a></p>
