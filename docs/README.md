
# Documentation Index — `docs/README.md`
Last Updated: 2025-08-15 (Asia/Tokyo, AI verified)

This folder contains the complete official documentation set for **openai-responses-mcp**.
**The specification in `spec.md` is canonical**, while others are supplementary documents for reference, operation, and verification.

---

## 1. Quick Start
```bash
# Dependencies & build (reproducibility focused)
npm ci
npm run build

# Check effective configuration (JSON output to stderr)
npx openai-responses-mcp --show-config 2> effective-config.json

# Minimal startup (MCP stdio)
npx openai-responses-mcp --stdio

# Smoke test (connectivity)
npm run mcp:smoke:ldjson
```

> Pass API keys via **environment variables** (required for some smoke tests/execution that use OpenAI API): `export OPENAI_API_KEY="sk-..."` (PowerShell: `$env:OPENAI_API_KEY="sk-..."`).

---

## 2. Canonical Specification (Must Read)
- **[spec.md](./spec.md)** — Product canonical specification (MCP I/F, `answer` I/O, System Policy, configuration priority, DoD, etc.)

---

## 3. Operational Documents
- **[changelog.md](./changelog.md)** — Change history (dates in Asia/Tokyo)
- **[verification.md](./verification.md)** — E2E verification procedures (with `jq` inspection examples)

---

## 4. Reference (Specification Details)
- **[reference/config-reference.md](./reference/config-reference.md)** — Configuration schema and priority (CLI > ENV > YAML > TS)
- **[reference/system-policy.md](./reference/system-policy.md)** — System Policy reference (SSOT is code: `src/policy/system-policy.ts`)
- **[reference/transports.md](./reference/transports.md)** — Transport specifications (stdio implemented / HTTP designed)
- **[reference/client-setup-claude.md](./reference/client-setup-claude.md)** — Registration procedures for Claude Code/Desktop (stdio)
- **[reference/installation.md](./reference/installation.md)** — Installation and local verification (npm pinning)
- **[reference/environment-setup.md](./reference/environment-setup.md)** — OS-specific environment preparation and proxy settings
- **[reference/reproducibility.md](./reference/reproducibility.md)** — Reproducibility & rebuild guide (snapshot operations)

---

## 5. File Structure (Key Points)
```
openai-responses-mcp/
  ├─ src/                 # TypeScript implementation
  │   ├─ config/          # defaults/load/paths (including priority logic)
  │   ├─ mcp/             # protocol/server (stdio JSON-RPC + framing)
  │   └─ tools/           # answer (Responses API + web_search)
  ├─ scripts/             # mcp-smoke.js / mcp-smoke-ldjson.js etc.
  ├─ build/               # Build artifacts (generated after `npm run build`)
  ├─ config/
  │   └─ config.yaml.example
  ├─ docs/                # ← This folder (specification, operation, reference)
  ├─ package.json
  └─ tsconfig.json
```

---

## 6. Configuration Priority (Recap, Abbreviated)
- **CLI > ENV > YAML > TS defaults** (last wins)
- Arrays are **replaced**, objects are **deep merged**.
- Effective values output as JSON via `--show-config` (stderr).

---

## 7. DoD (Current Requirements)
- HTTP 404 → `used_search=false`, `citations=[]`
- Today's Tokyo weather YYYY-MM-DD → `used_search=true`, body contains URL + ISO date, `citations>=1`

---

## 8. Contribution Guidelines (Excerpt)
- For specification changes, **update spec.md first** (canonical).
- Record dependency updates as patch/minor in `changelog.md`.
- **Structural regression checking** using `.snapshots/` is recommended.

---

## 9. Contact and License
- License: MIT (per `package.json`)
- Contact: Please use Pull Requests / Issues.
