
# System Policy — Reference (SSOT: Code)
Last updated: 2025-08-09 (Asia/Tokyo)

This project unifies the System Policy source-of-truth (SSOT) on the **code side**. The Responses API `instructions` are given the constants defined in code **as-is**.

- SSOT: `src/policy/system-policy.ts`
  - `export const SYSTEM_POLICY` (body text)
  - `export const SYSTEM_POLICY_REV` (revision identifier)

This document is a reference guide. It does not maintain copies of the body text. To change content, always update `src/policy/system-policy.ts`.

---

## 1. Operating Principles
- This server is a backend for the MCP tool `answer` and uses the **OpenAI Responses API**.
- **Always allows** `tools: [{"type":"web_search"}]` for every request. Whether to execute searches is **decided by the model**.
- Returns are **structured** with main text, search usage status, sources (URL/date/title), and used model (output contract detailed later).
- Tenses/relative dates are converted to absolute dates in **Asia/Tokyo**.

---

## 2. Location of Model-Oriented Normative Text
Please refer to `SYSTEM_POLICY` in `src/policy/system-policy.ts` (the body text is not duplicated in this document).

Tips:
- Change procedure: Edit `SYSTEM_POLICY` in code → Build/restart
- Version check: Reference `SYSTEM_POLICY_REV`

---

## 3. Additional Guidelines for Search Decisions
- **Examples to use search**: Weather, exchange rates/markets, news, prices/inventory, release notes, security information (CVE, etc.), support/EOL, latest organizational/personnel information, legal/regulatory/standard updates, latest API/SDK specifications.
- **Examples to avoid search**: General HTTP/SQL/OS command meanings, mathematical theorems, historical facts (except new discoveries), word meanings/term definitions (already standardized).

---

## 4. Source Handling
- **Count**: Default 1-3 items (follow `policy.max_citations`).
- **Quality**: Prioritize official sites, primary sources, authoritative media, peer-reviewed papers, etc. Avoid contribution sites/generated summary sites.
- **Date**: When publication date is not specified, add **access date** (ISO). For news, etc., also include **retrieval date** in body text (Asia/Tokyo).
- **Duplication**: When multiple URLs exist for the same content, narrow down to the best 1 item.

---

## 5. Output Contract (Specification Server Implementation Depends On)
- Main text (natural language) → Bullet points (evidence/procedures) → **Sources:** (only when web_search is used) in that order.
- **Do not output Sources** when search is not used.
- MCP response `citations[]` stores `{url, title?, published_at?}`. `published_at` is ISO string or `null`/omitted.
- `used_search` is `true` when 1 or more `url_citation` is obtained, or when `web_search_call` is included.

---

## 6. Date & Time Rules
- Relative dates in output are **always** converted to absolute dates (`YYYY-MM-DD`). Timezone is fixed to **Asia/Tokyo**.
- Example: "Today" → "2025-08-09 (JST)" with parenthetical supplements as needed.

---

## 7. Failure Response Policy
- When information cannot be confirmed due to search or API call issues, **explicitly state uncertainty** such as "insufficient confirmed information" or "multiple views exist" before presenting the best judgment.
- In case of critical errors (timeout, etc.), indicate the minimum steps the user should take next (re-execution, condition relaxation, etc.).

---

## 8. Implementation Expectations (Behavior MCP Server Assumes)
- Pass `tools: [{type:"web_search"}]` to Responses API **every time**.
- Give `instructions` the **exact text from Chapter 2 of this file** (no modification allowed).
- Thresholds like `policy.max_citations` can be controlled by settings (TS defaults / YAML / ENV / CLI).

---

## 9. Test Perspectives (DoD Excerpt)
- "Meaning of HTTP 404" → `used_search=false`, `citations=[]`.
- "Today YYYY-MM-DD Tokyo weather" → `used_search=true`, `citations>=1`, URL + ISO date included in body text.
