# openai-responses-mcp
OpenAI Responses API を推論コアに採用した軽量な MCP サーバです。  
`web_search` を常時許可し、実際に検索を行うかはモデルが自律判断します。Claude Code/Claude Desktop 等の MCP クライアントから stdio で利用します。

重要: 仕様の正準は `docs/spec.md` です。詳細はそちらを参照してください。

--

## Repository Structure
- `src/`                         : TypeScript ソース（唯一の正準）
- `scripts/`                     : 検証/補助スクリプト（`mcp-smoke*`, `clean.js` 等）
- `config/`
  - `config.yaml.example`        : 設定サンプル（実設定はコミットしない）
  - `policy.md.example`          : 外部 System Policy のサンプル
- `docs/`                        : 正準仕様/リファレンス/検証手順
  - `spec.md`                    : 正準仕様
  - `reference/`                 : 設定・導入・連携リファレンス
  - `verification.md`            : E2E 検証手順
- `README.md`                    : プロジェクト概要/クイックスタート
- `LICENSE`                      : ライセンス
- `package.json`, `package-lock.json` : npm 設定/依存固定
- `tsconfig.json`                : TypeScript 設定
- `.gitignore`                   : Git 除外設定

注: `build/` や `node_modules/`、`config/config.yaml`（実運用設定）などは GitHub にはアップロードしません（`.gitignore` 対象）。

--

## 特長（概要）
- Responses API 準拠（公式JS SDK `openai`）
- 検索はモデルに委譲（`web_search` を常時許可）
- 構造化出力（本文・`used_search`・`citations[]`・`model`）
- System Policy はコード内SSOT（`src/policy/system-policy.ts`）
- MCP stdio 実装（`initialize`/`tools/list`/`tools/call`）

## 要件
- Node.js v20 以上（推奨: v24）
- npm（Node 同梱）
- OpenAI API キー（環境変数で渡す）

--

## 最小構成（必須設定だけで起動）
- 必須設定: 環境変数 `OPENAI_API_KEY` のみ（YAMLは不要）
- 起動例（npx）:
  - `export OPENAI_API_KEY="sk-..." && npx openai-responses-mcp@latest --stdio`

YAML は後から追加可能です（既定パス: macOS/Linux `~/.config/openai-responses-mcp/config.yaml`、Windows `%APPDATA%\\openai-responses-mcp\\config.yaml`）。

--

## 利用者向け（MCPとして使う）

### 1) npx で即実行（推奨）
```bash
export OPENAI_API_KEY="sk-..."  # macOS/Linux（PowerShellは $env:OPENAI_API_KEY="sk-..."）
npx openai-responses-mcp@latest --stdio --debug ./_debug.log --config ~/.config/openai-responses-mcp/config.yaml
```

### 2) Claude Code への登録例（npx）
クライアントの設定（UIから開ける `mcpServers`）に次を追加:
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

### 3) 設定（YAML 任意）
既定パス: macOS/Linux `~/.config/openai-responses-mcp/config.yaml`、Windows `%APPDATA%\openai-responses-mcp\config.yaml`

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

### 4) ログとデバッグ
- デバッグON（画面出力）: `--debug` または `DEBUG=1|true`
- デバッグON（ファイル＋画面ミラー）: `--debug ./_debug.log` または `DEBUG=./_debug.log`
- デバッグOFF: 最小限の稼働確認ログのみ

補足（YAMLでの制御）:
- `server.debug: true|false`
- `server.debug_file: <path|null>`

--

## 開発者向け（クローンして開発）

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

--

## メンテナ向け（配布）

### npm パッケージ確認と公開
```bash
npm pack --dry-run    # 同梱物を確認（build/ と README/LICENSE/サンプルのみ）
npm publish           # 公開（スコープなし）
```

--

## トラブルシュート（要点）
- `Missing API key`: `OPENAI_API_KEY` 未設定。ENV を見直し
- `Cannot find module build/index.js`: ビルド未実行 → `npm run build`
- フレーミング不一致: `npm run mcp:smoke` で確認し再ビルド
- 429/5xx 多発: `request.max_retries`/`timeout_ms` を調整（YAML）

--

## ライセンス
MIT
