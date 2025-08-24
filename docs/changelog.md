# Changelog

本プロジェクトの変更履歴です。日付は Asia/Tokyo 基準です。

## [0.5.0] - 2025-08-24
- feat(protocol): MCP キャンセルに対応（`notifications/cancelled`）。該当 `requestId` の処理を中断し、以後は `result/error` を送らない。未登録/完了済みは無視。
- feat(runtime): OpenAI 呼び出しに `AbortSignal` を伝搬。キャンセル時はリトライを行わず即中断。
- fix(server): キャンセル直後の例外でもエラー応答を抑止するよう実行順序と in-flight 管理を調整。
- feat(tests/ci): `scripts/test-*.js` を追加（tools-list, cancel-noinflight, cancel-during-call）。CI に常時/条件テストを組み込み。
- docs: `docs/spec.md` に「6.1 キャンセル」を追加、`docs/verification.md` に自動テスト手順を追記。

## [0.4.8] - 2025-08-23
- fix(protocol): `initialize` 応答から `capabilities.roots` を削除（未実装機能の広告を停止）。Claude Code からの `roots/list` 呼び出しによる切断を予防。
- feat(protocol): `ping` を最小実装（ヘルスチェック用、空オブジェクトで成功応答）。
- feat(logging): デバッグ指定の統一（CLI/ENV/YAML 同義）。`--debug` / `DEBUG=1|<path>` / `server.debug(.debug_file)` の優先度を CLI > ENV > YAML で統一。`DEBUG_MCP` は廃止（後方互換のため非推奨扱いのみ）。
- docs: `protocolVersion` を `2025-06-18` に統一。トランスポート/仕様の該当セクション更新。
- chore: スモークに `scripts/mcp-smoke-ping.js` を追加（`ping` 確認用）。

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
