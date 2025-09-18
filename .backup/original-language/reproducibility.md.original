
# 再現性・再構築ガイド — `docs/reference/reproducibility.md`
最終更新: 2025-08-15（Asia/Tokyo, AI確認）

この文書は **openai-responses-mcp** の結果・挙動を**できる限り再現**するための運用規約と具体手順を定義します。  
「npm 固定」「安定版のみ」「要約禁止」の方針に準拠します。

---

## 1. 前提と限界（LLM＋検索の非決定性）
再現性を阻害しうる要因を先に明示します。完全決定性は**保証しません**。

- **LLM 非決定性**：温度設定固定でも同一応答が出ない可能性がある（OpenAI 側仕様）。
- **web_search の可変性**：インデックス更新、ランク変動、記事の改稿・削除。
- **時制依存**：相対日付は JST（Asia/Tokyo）で絶対化するが、**「本日」**は日が変わると結果も変わる。
- **API バージョン**：OpenAI SDK/Responses API のマイナー変更で注釈フォーマットが変わる可能性。

→ 本リポジトリは以下の**緩和策**で「十分に同等な再現」を狙います。

---

## 2. バージョン固定（強制）
- **Node**: 同一メジャーを全員で使用（推奨: v24 系）。
  - `package.json` の `engines.node` を利用（例: `">=20 <25"`）。
  - 任意（推奨）：`.nvmrc` / `volta` / `asdf` 等で OS ローカル固定（*npm 固定の方針に反しない*）。
- **npm**: Node 同梱を使用。依存導入は **`npm ci`** を優先（`package-lock.json` 前提）。
- **依存**: `package.json` は **厳密バージョン**（`^`/`~`を避ける）。
  - 変更が必要なときは**必ず** `changelog.md` を更新し、`package-lock.json` と同時コミット。

> 代表設定（例）: `package.json`
```json
{
  "engines": { "node": ">=20 <25" },
  "overrides": {},
  "packageManager": "npm@11"
}
```

---

## 3. 設定スナップショット（事実の固定）
**実効設定**を JSON で保存しておくと、後から「どの設定で動かしたか」を再現できます。

```bash
# 実効設定を保存（sources = 反映元、effective = 実際に使われた値）
npx openai-responses-mcp --show-config 2> .snapshots/effective-config.json
```

- `--config` を指定した場合はパスも `sources.yaml` に残る。
- ENV/CLI を使った場合、`sources.env`/`sources.cli` に**キー名**が記録される。

> 参考: スキーマと主要キーは `docs/reference/config-reference.md` を参照。

---

## 4. タイムゾーン・日付の固定
- すべての相対日付は **Asia/Tokyo** で絶対化（サーバ実装規約）。
- テスト時は OS の `TZ` を明示して起動すると観測系の差異を避けやすい：
```bash
TZ=Asia/Tokyo npx openai-responses-mcp --show-config 2> /tmp/effective.json; head -n 5 /tmp/effective.json
```

---

## 5. 安定・時事テストの分離（スイート構成）
テストケースを 2 系列に分けます。

### 5.1 MCP レイヤ（API鍵不要・決定性重視）
- 期待: `initialize` と `tools/list` の応答形が安定
```bash
npm run mcp:smoke:ldjson | tee .snapshots/mcp-ldjson.out
```

### 5.2 API 呼び出しを含むケース（要 OPENAI_API_KEY）
- 期待: `initialize`/`tools/list`/`tools/call(answer)` の3応答が取得できる（本文は非決定）
```bash
export OPENAI_API_KEY="sk-..."
npm run mcp:smoke | tee .snapshots/mcp-content-length.out
```

> 比較は**厳密一致ではなく、構造のチェック**（キーの有無、件数、型）を重視する。

---

## 6. 比較・回帰チェック（例）
```bash
# LDJSON の行数や JSON 形を比較（本文の完全一致は求めない）
wc -l .snapshots/mcp-ldjson.out
grep -c '"jsonrpc":"2.0"' .snapshots/mcp-ldjson.out
```

---

## 7. ネットワークとプロキシの固定
- 企業ネットワーク経由時は `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` を**必ず**記録。  
- 取得失敗（429/5xx/Abort）が続く再現がある場合は、**レイテンシや再試行回数**もログへ。

---

## 8. リリース・タグ運用
- 仕様変更（`spec.md`）や System Policy 改訂時は **MINOR** 以上を上げる（セマンティックバージョニング）。
- 依存更新のみは PATCH。挙動が変わる可能性があると判断したら MINOR。
- `changelog.md` に**根拠（なぜ上げたか）**を残す。

---

## 9. スナップショット・フォルダ規約
```
.snapshots/
  effective-config.json         # --show-config の出力
  baseline-404.json             # 安定知識の期待形/断片
  baseline-weather-shape.json   # 時事系の「構造」期待
```
- 実運用では CI で `.snapshots` を比較に使い、**形の崩れ**を検知する。  
- 非決定要素（本文内容など）は厳密一致を避け、形・件数・キーの存在確認に留める。

---

## 10. 依存・設定の変更フロー（提案規約）
1. ブランチで変更（依存・設定・ポリシー）。
2. `npm ci && npm run build` で再現性を確認。
3. **全スイート**（安定/時事）を実行し、`.snapshots` を更新。
4. `docs/changelog.md` と `docs/status.md` を更新。
5. PR でレビュー（特に **System Policy** の改変は慎重に）。

---

## 11. 既知の再現難ポイントとワークアラウンド
- **ニュース系**: 記事の公開日時が ISO で取得できない場合がある。本文に**アクセス日**を併記してもらう（System Policy）。
- **検索結果の順序**: `policy.max_citations` を 1 に絞って**最良 1 件**にすることで差異を小さくする。
- **モデル更新**: `MODEL_ANSWER` を固定 ID に。更新を許すなら **DoD** を形チェックに限定。

---

## 12. 最低限の「再現できた」証拠の残し方
- `npx openai-responses-mcp --show-config 2> .snapshots/effective-config.json`
- `npm run mcp:smoke:ldjson > .snapshots/mcp-ldjson.out`
- （任意）`npm run mcp:smoke > .snapshots/mcp-content-length.out`（要 `OPENAI_API_KEY`）

以上 3 点が揃っていれば、**誰でも**同じ配置・同じバージョンで**同等結果**を再現できます。
