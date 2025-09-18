# Codex CLI Authentication Integration PRD

## 1. Executive Summary
- **Objective**: Eliminate redundant authentication for `ai-openai-codex-mcp` users by detecting and reusing Codex CLI credentials, refreshing tokens automatically, validating them before use, and falling back gracefully without regressing existing functionality.
- **Top Outcomes**:
  - Zero manual API key entry when Codex CLI is already logged in.
  - Silent token refresh leveraging Codex's native flow (no user prompts) paired with proactive validation and health monitoring.
  - Automatic remediation when credentials are missing by invoking `codex login` for the user, with bounded retries and backoff.
- **Success Metrics**: ≥90% of Codex CLI users authenticate without additional configuration; no increase in auth-related error rate; integration tests green across supported OSes; authentication health checks remain green in continuous monitoring.

## 2. Goals & Non-Goals
### 2.1 Goals
1. Discover Codex auth JSON via configurable path with `CODEX_HOME` awareness.
2. Validate and extract OAuth tokens (`access_token`, `refresh_token`) plus optional API key from Codex auth store.
3. Refresh tokens automatically via Codex CLI when stale, without user interaction, and verify returned credentials before adoption.
4. Auto-trigger `codex login` when credentials are absent or unusable, then retry load with bounded retries/backoff.
5. Maintain existing environment-variable and manual API key flows as tertiary fallbacks.
6. Provide clear documentation (README/AGENTS.md) covering configuration, fallbacks, troubleshooting, security expectations, health checks, and observability hooks.
7. Offer an optional health-check surface so operators can monitor authentication status.

### 2.2 Non-Goals
- Replacing the current MCP server with Codex's native MCP implementation (future work).
- Re-implementing Codex's refresh protocol; we call the CLI instead.
- Managing enterprise-specific credential vaults or secrets managers (document as future extension).

## 3. Stakeholders & Users
- **Primary users**: Developers running Codex CLI who want MCP integration without extra setup.
- **Secondary**: Ops/IT teams evaluating security posture; maintainers responsible for repo.

## 4. User Stories
1. "As a Codex CLI user, once I'm logged in via ChatGPT, the MCP server should work immediately with no extra configuration." 
2. "As an operator, I want expired tokens to refresh automatically during agent startup so workflows are uninterrupted." 
3. "As a maintainer, I need a safe fallback when auth fails so I can still use manual API keys." 
4. "As a security reviewer, I need confirmation that auth.json permissions are respected and secrets aren't leaked."

## 5. Key Requirements
### 5.1 Functional Requirements
- **FR1**: Resolve `config.codex.authPath` to an absolute path using precedence:
  1. `config.codex.authPath` (if provided).
  2. `$CODEX_HOME/auth.json` when `CODEX_HOME` env var is set.
  3. Default `~/.codex/auth.json`.
- **FR2**: Validate path readability and enforce secure permissions (chmod ≤ 0o600 on Unix, hidden + user-only on Windows; warn otherwise).
- **FR3**: Parse JSON schema and validate contents before use:
  ```json
  {
    "OPENAI_API_KEY": "optional",
    "tokens": {
      "id_token": "...",
      "access_token": "...",
      "refresh_token": "...",
      "account_id": "optional"
    },
    "last_refresh": "ISO8601 timestamp",
    "token_source": "optional metadata"
  }
  ```
- **FR4**: Determine token expiry by consulting both `last_refresh` and JWT claims (`exp`) where available; proactively refresh when tokens have <48 hours remaining or validation fails.
- **FR5**: After refresh, validate the token by performing a lightweight authenticated ping (dry-run request) before caching.
- **FR6**: When auth.json is missing or unreadable, execute `codex login --json` automatically with exponential backoff (max 3 attempts across 90 seconds), surfacing output in logs at info level, then retry token load.
- **FR7**: Provide ordered credential selection:
  1. Fresh OAuth access token (post-refresh) that passes validation ping.
  2. `OPENAI_API_KEY` within auth.json.
  3. Environment variable (`OPENAI_API_KEY` or configured override).
  4. Fail with actionable error message if none available.
- **FR8**: Ensure tokens are injected into existing OpenAI client without altering other configuration flows.
- **FR9**: Emit structured diagnostics when each fallback triggers, while redacting sensitive values, and expose summarized health status via CLI flag/endpoint.
- **FR10**: Implement coordination (file locking / OS mutex) so only one process performs refresh/login at a time; others reuse cached result.
- **FR11**: Provide a machine-readable health-check command (`npm run health`) with distinct exit codes (0 healthy, 10 degraded, 1 catastrophic) suitable for cron/systemd automation.
- **FR12**: Ship reference automation (systemd timer + OnFailure hook) that auto-runs the health check, performs bounded self-healing, and escalates only catastrophic failures to the user.

### 5.2 Non-Functional Requirements
- **NFR1**: With warm cache, auth resolution must complete within 2 seconds on average (excluding Codex CLI network latency); cold flows must respect retry/backoff ceilings.
- **NFR2**: Must support macOS, Linux, Windows (including WSL) where Codex CLI is supported.
- **NFR3**: No new dependencies that require system-level installation beyond existing stack.
- **NFR4**: Unit/integration tests must cover success, refresh, missing file, malformed JSON, and permission warning scenarios.

### 5.3 Security Requirements
- Do not log raw tokens or sensitive file contents.
- Fail closed when permissions are overly broad; require user remediation or explicit override flag.
- Respect system locale and path rules without shell injection (sanitize command args).
- Acquire advisory locks before invoking refresh/login to avoid concurrent mutation.
- Cache tokens in memory with TTL + file mtime invalidation to reduce filesystem churn while preventing stale usage.

## 6. Deliverables
1. **Code**: Auth loader module, configuration updates, CLI invocation helpers, caching/locking utilities, integration wiring, tests.
2. **Documentation**: Updated README, AGENTS.md section, new `docs/codex-auth-integration-prd.md`, plus systemd automation guide.
3. **Tooling**: Optional scripts/tests to simulate Codex CLI interactions (mock wrappers).
4. **Issue Update**: Comment on Issue #8 summarizing plan and path correction.

## 7. Acceptance Criteria
- AC1: Starting MCP server with Codex CLI logged in succeeds without manual API key.
- AC2: Tokens nearing expiry trigger transparent refresh by executing Codex CLI once; validation ping succeeds and cache updates.
- AC3: Deleting auth.json leads to automatic `codex login` (max 3 attempts with backoff); execution proceeds afterward or surfaces explicit failure after exhausting retries.
- AC4: Permissions warning emitted if auth.json is world-readable; process exits unless user sets override.
- AC5: Environment-variable fallback still functions when Codex CLI is absent.
- AC6: Health check endpoint/CLI flag reports `healthy` when tokens valid, `degraded` when fallbacks engaged, and `unhealthy` when auth fails.
- AC7: Cache purges on shutdown and never exceeds configured bounds; rate limiter prevents validation spam (verified in tests).
- AC8: Test suite passes (unit + integration + signal handling) with new coverage; CI green.
- AC9: Documentation reflects configuration knobs, health checks, monitoring guidance (including systemd automation), troubleshooting steps, and partial-corruption recovery.
- AC10: `npm run health` returns correct exit codes/status for healthy, degraded, and catastrophic scenarios.

## 8. Implementation Plan
### Phase 0 – Preparation (0.5 day)
- Align with Issue #8 via comment update (correct paths, outline plan).
- Capture current config structure and ensure no conflicting changes on main.

### Phase 1 – Loader, Config & Caching Foundation (1.5 days)
- Introduce `CodexAuthLoader` with path resolution, permission check, JSON parsing, in-memory caching (TTL + mtime invalidation + bounded size with LRU eviction).
- Extend configuration schema (`config/config.yaml`, TS types) with `codex.enabled`, `codex.authPath`, `codex.autoRefresh`, `codex.permissionStrict`, `codex.cacheTtlMs`, `codex.cacheMaxEntries`, `codex.validationRateLimitMs`, `codex.healthCheckPort`.
- Add unit tests with fixture auth.json variations, covering malformed JSON, permissions, cache invalidation.

### Phase 2 – Refresh, Validation & CLI Integration (1.5 days)
- Implement signal-aware wrapper so refresh/login exits cleanly on SIGINT/SIGTERM and releases locks.
- Rate-limit validation ping requests per process (configurable, default ≤1/5min).
- Implement CLI execution wrapper using `child_process.spawn` with sanitized args, exponential backoff, bounded retries.
- Add silent refresh flow using `codex auth refresh --json`; re-read auth.json, validate tokens via lightweight API ping, update cache.
- Auto-run `codex login --json` when file missing; cap retries (default 3), include advisory locking to prevent concurrent login storms.
- Mock CLI + API ping via dependency injection to simulate responses, network failures, timeouts.

### Phase 3 – Integration, Fallback Logic & Concurrency (1 day)
- Wire loader into OpenAI client initialization; preserve environment fallbacks.
- Ensure existing manual key configuration remains intact.
- Add integration tests covering success path, refresh path, CLI missing scenario, concurrent refresh attempts, cache reuse.

### Phase 4 – Documentation, Health Checks & Hardening (1 day)
- Update README/AGENTS.md with configuration instructions, security notes, troubleshooting, monitoring/health-check guidance.
- Document new settings in `docs/reference/config-reference.md`.
- Add changelog entry and migration notes.
- Define observability outputs (structured logs + optional metrics hook).

- Manual smoke tests on macOS/Linux/Windows (where feasible) using mock or actual Codex CLI; include scenarios with network disruption, signal interrupts mid-refresh, and partially corrupted auth.json recovery.
- Verify logging redaction, failure modes, health-check responses.
- Prepare final PR with summary, risk analysis, test matrix, and open metrics hook instructions.

## 9. Testing Strategy
- **Unit Tests**: Path resolution, schema validation, permission checks, stale detection logic.
- **Mocked CLI Tests**: Ensure refresh/login commands invoked with correct args, handle timeouts/non-zero exit codes.
- **Integration Tests**: Full client initialization using fixture directories representing various states, network failures, concurrent access, and partial file corruption scenarios.
- **Regression Tests**: Ensure manual API key path remains unaffected.
- **Load/Concurrency Tests**: Stress multi-process refresh to validate locking/backoff.
- **Manual QA**: Run end-to-end on at least one platform with real Codex CLI; include validation of health-check endpoint and monitoring hooks.

## 10. Risks & Mitigations
| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| Codex CLI command changes | Medium | Low | Detect CLI version, guard with feature check, document minimum version. |
| CLI not installed | Medium | Medium | Detect absence, provide install guidance, fall back to env var. |
| Auto `codex login` hanging (no browser) | High | Medium | Set timeout, exponential backoff, surface instructions, allow opt-out. |
| Permission checks incompatible on Windows | Medium | Medium | Use platform-specific APIs, document overrides. |
| Silent refresh fails unexpectedly | Medium | Medium | Log non-sensitive error, retry bounded times, fall back to manual path. |
| Multiple processes refreshing simultaneously | Medium | Medium | Implement advisory locking + cache reuse. |
| Codex CLI version drift | Medium | Medium | Detect version via `codex --version`, feature-flag behavior, document minimum version. |
| Monitoring gaps obscure auth issues | Medium | Low | Ship health-check + structured logging/metrics instructions. |
| Partial auth.json corruption | Medium | Medium | Detect, trigger corrective refresh/login once, then surface remediation guidance. |

## 11. Open Questions
- Do we need telemetry to measure refresh success/failure counts? (Optional)
- Should we add config to disable auto `codex login` for headless servers that pre-provision auth.json? (Default to enabled per requirements.)
- How to mock Codex CLI in CI reliably (consider shipping stub script under tests)?

## 12. References
- [OpenAI Codex Repository](https://github.com/openai/codex)
- [Codex Authentication Docs](https://github.com/openai/codex/blob/main/docs/authentication.md)
- [Auth implementation (Rust)](https://github.com/openai/codex/blob/main/codex-rs/core/src/auth.rs)
- [Issue #8](https://github.com/jfontestad/ai-openai-codex-mcp/issues/8)
