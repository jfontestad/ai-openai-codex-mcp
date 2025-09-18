
# Reproducibility & Rebuild Guide - `docs/reference/reproducibility.md`
Last Updated: 2025-08-15 (Asia/Tokyo, AI verified)

This document defines operational standards and specific procedures for **reproducing the results and behavior** of **openai-responses-mcp** as closely as possible.
It adheres to the "npm pinning", "stable versions only", and "no summaries" policy.

---

## 1. Prerequisites and Limitations (Non-determinism of LLM + Search)
Factors that may hinder reproducibility are identified upfront. Complete determinism is **not guaranteed**.

- **LLM non-determinism**: Even with fixed temperature settings, identical responses may not occur (OpenAI specification).
- **web_search variability**: Index updates, ranking changes, article revisions/deletions.
- **Time dependence**: Relative dates are absolutized to JST (Asia/Tokyo), but **"today"** changes results when the date changes.
- **API versions**: Minor changes to OpenAI SDK/Responses API may alter annotation formats.

-> This repository aims for "sufficiently equivalent reproduction" through the following **mitigation strategies**.

---

## 2. Version Pinning (Mandatory)
- **Node**: Use the same major version across all users (recommended: v24 series).
  - Utilize `engines.node` in `package.json` (e.g., `">=20 <25"`).
  - Optional (recommended): Pin locally with `.nvmrc` / `volta` / `asdf` etc. (*does not conflict with npm pinning policy*).
- **npm**: Use Node bundled version. Prioritize **`npm ci`** for dependency installation (`package-lock.json` prerequisite).
- **Dependencies**: Use **exact versions** in `package.json` (avoid `^`/`~`).
  - When changes are needed, **always** update `changelog.md` and commit with `package-lock.json`.

> Representative configuration (example): `package.json`
```json
{
  "engines": { "node": ">=20 <25" },
  "overrides": {},
  "packageManager": "npm@11"
}
```

---

## 3. Configuration Snapshots (Fact Pinning)
Saving **effective configuration** in JSON allows later reproduction of "which settings were used".

```bash
# Save effective configuration (sources = reflection source, effective = actually used values)
npx openai-responses-mcp --show-config 2> .snapshots/effective-config.json
```

- When `--config` is specified, the path is also recorded in `sources.yaml`.
- When ENV/CLI is used, **key names** are recorded in `sources.env`/`sources.cli`.

> Reference: See `docs/reference/config-reference.md` for schema and main keys.

---

## 4. Timezone & Date Pinning
- All relative dates are absolutized to **Asia/Tokyo** (server implementation standard).
- During testing, explicitly setting OS `TZ` on startup helps avoid observational system differences:
```bash
TZ=Asia/Tokyo npx openai-responses-mcp --show-config 2> /tmp/effective.json; head -n 5 /tmp/effective.json
```

---

## 5. Stable vs. Current Event Test Separation (Suite Configuration)
Test cases are divided into 2 series.

### 5.1 MCP Layer (No API key required, determinism focused)
- Expected: `initialize` and `tools/list` response formats are stable
```bash
npm run mcp:smoke:ldjson | tee .snapshots/mcp-ldjson.out
```

### 5.2 Cases Including API Calls (Requires OPENAI_API_KEY)
- Expected: 3 responses `initialize`/`tools/list`/`tools/call(answer)` can be obtained (content is non-deterministic)
```bash
export OPENAI_API_KEY="sk-..."
npm run mcp:smoke | tee .snapshots/mcp-content-length.out
```

> Comparison emphasizes **structural checking** (presence of keys, count, type) rather than strict matching.

---

## 6. Comparison & Regression Checking (Example)
```bash
# Compare LDJSON line count and JSON format (don't require perfect content match)
wc -l .snapshots/mcp-ldjson.out
grep -c '"jsonrpc":"2.0"' .snapshots/mcp-ldjson.out
```

---

## 7. Network and Proxy Pinning
- When using corporate networks, **always** record `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY`.
- If reproduction with persistent acquisition failures (429/5xx/Abort) occurs, also log **latency and retry counts**.

---

## 8. Release & Tag Operations
- When specification changes (`spec.md`) or System Policy revisions occur, raise **MINOR** or higher (semantic versioning).
- Dependency updates only: PATCH. If judged that behavior may change: MINOR.
- Record **rationale (why raised)** in `changelog.md`.

---

## 9. Snapshot Folder Standards
```
.snapshots/
  effective-config.json         # --show-config output
  baseline-404.json             # Expected format/fragment for stable knowledge
  baseline-weather-shape.json   # "Structure" expectation for current events
```
- In production, use `.snapshots` for comparison in CI to detect **structural breakage**.
- For non-deterministic elements (content, etc.), avoid strict matching and limit to format/count/key existence verification.

---

## 10. Dependency & Configuration Change Flow (Proposed Standards)
1. Change in branch (dependency, configuration, policy).
2. Confirm reproducibility with `npm ci && npm run build`.
3. Run **full suite** (stable/current) and update `.snapshots`.
4. Update `docs/changelog.md` and `docs/status.md`.
5. Review via PR (especially **System Policy** changes require care).

---

## 11. Known Difficult Reproduction Points and Workarounds
- **News content**: Article publication dates may not be obtainable in ISO format. Include **access date** in content via System Policy.
- **Search result order**: Narrow down to **best 1 item** by setting `policy.max_citations` to 1 to minimize differences.
- **Model updates**: Fix `MODEL_ANSWER` to a specific ID. If updates are allowed, limit **DoD** to format checking only.

---

## 12. Minimum "Successfully Reproduced" Evidence Recording Method
- `npx openai-responses-mcp --show-config 2> .snapshots/effective-config.json`
- `npm run mcp:smoke:ldjson > .snapshots/mcp-ldjson.out`
- (Optional) `npm run mcp:smoke > .snapshots/mcp-content-length.out` (requires `OPENAI_API_KEY`)

With these 3 items in place, **anyone** can reproduce **equivalent results** with the same deployment and same versions.
