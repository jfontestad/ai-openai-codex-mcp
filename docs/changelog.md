# Changelog

本プロジェクトの変更履歴です。日付は Asia/Tokyo 基準です。

## [0.4.7] - 2025-08-19
- docs: 表現を統一（「薄い/Thin MCP server」→「軽量な/Lightweight MCP server」）
  - 対象: `README.md`, `docs/spec.md`, `package.json(description)`
- meta: `docs/spec.md` の版数・最終更新日を更新
- note: 機能・API・設定仕様に変更なし（ドキュメントのみ）

## [0.4.6] - 2025-08-19
- 初回正式リリース（First official release）
- 特長:
  - OpenAI Responses API 準拠（公式JS SDK `openai`）
  - `web_search` を常時許可し、実際の検索実行はモデルに委譲
  - 構造化出力（本文・`used_search`・`citations[]`・`model`）
  - System Policy はコード内SSOT（`src/policy/system-policy.ts`）
  - MCP stdio 実装（`initialize` / `tools/list` / `tools/call`）

