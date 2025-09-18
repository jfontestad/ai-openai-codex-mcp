# Changelog

Change history for this project. Dates are based on Asia/Tokyo.

## [0.6.0] - 2025-08-27
- feat(logging): Unified debug determination. Made CLI/ENV/YAML equivalent and standardized priority as CLI > ENV > YAML (final decision at startup → subsequent isDebug() reference).
- refactor(logging): Added `src/debug/state.ts` to centralize debug output paths including stderr→file TEE mirroring.
- breaking(logging): Removed support for `DEBUG_MCP` / `MCP_DEBUG` environment variables (only `DEBUG=1|true|<path>` going forward).
- docs: Updated `docs/spec.md` / `docs/reference/*` / `README.*` to single determination/equivalence specification. Removed `server.log_level` description.
- config: Updated `config/config.yaml.example` to `server.debug` / `server.debug_file` / `show_config_on_start`.
- chore(tests): Added `_temp_/_ai_/run-yaml-debug-test.js`. Unified script `DEBUG_MCP` to `DEBUG`.

## [0.5.0] - 2025-08-24
- feat(protocol): Added MCP cancellation support (`notifications/cancelled`). Interrupts processing for the corresponding `requestId` and no longer sends `result/error` afterwards. Ignores unregistered/completed requests.
- feat(runtime): Propagates `AbortSignal` to OpenAI calls. No retries on cancellation, immediate interruption.
- fix(server): Adjusted execution order and in-flight management to suppress error responses even on exceptions immediately after cancellation.
- feat(tests/ci): Added `scripts/test-*.js` (tools-list, cancel-noinflight, cancel-during-call). Incorporated continuous/conditional testing into CI.
- docs: Added "6.1 Cancellation" to `docs/spec.md`, added automated test procedures to `docs/verification.md`.

## [0.4.8] - 2025-08-23
- fix(protocol): Removed `capabilities.roots` from `initialize` response (stopped advertising unimplemented features). Prevents disconnection from `roots/list` calls from Claude Code.
- feat(protocol): Minimal implementation of `ping` (for health checks, successful response with empty object).
- feat(logging): Unified debug specification (CLI/ENV/YAML equivalent). Standardized priority of `--debug` / `DEBUG=1|<path>` / `server.debug(.debug_file)` as CLI > ENV > YAML. `DEBUG_MCP` deprecated (only treated as deprecated for backward compatibility).
- docs: Standardized `protocolVersion` to `2025-06-18`. Updated relevant transport/specification sections.
- chore: Added `scripts/mcp-smoke-ping.js` to smoke tests (for `ping` verification).

## [0.4.7] - 2025-08-19
- docs: Unified expression ("thin MCP server" → "lightweight MCP server")
  - Targets: `README.md`, `docs/spec.md`, `package.json(description)`
- meta: Updated version and last update date in `docs/spec.md`
- note: No changes to functionality, API, or configuration specifications (documentation only)

## [0.4.6] - 2025-08-19
- First official release
- Features:
  - OpenAI Responses API compliant (official JS SDK `openai`)
  - Always allows `web_search`, delegates actual search execution to the model
  - Structured output (content, `used_search`, `citations[]`, `model`)
  - System Policy is SSOT in code (`src/policy/system-policy.ts`)
  - MCP stdio implementation (`initialize` / `tools/list` / `tools/call`)
