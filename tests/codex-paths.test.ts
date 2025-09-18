import { strict as assert } from "node:assert";
import { test } from "node:test";

import { resolveAuthPath } from "../src/codex/paths.js";

const home = "/home/example";

function makeConfig(partial: Partial<import("../src/config/defaults.js").Config["codex"]> = {}) {
  return {
    enabled: true,
    authPath: "~/.codex/auth.json",
    autoRefresh: true,
    permissionStrict: true,
    cacheTtlMs: 5 * 60_000,
    cacheMaxEntries: 4,
    validationRateLimitMs: 5 * 60_000,
    healthCheckPort: undefined,
    ...partial
  };
}

test("explicit config path wins", () => {
  const cfg = makeConfig({ authPath: "~/custom/auth.json" });
  const result = resolveAuthPath(cfg, { HOME: home });
  assert.equal(result, `${home}/custom/auth.json`);
});

test("CODEX_HOME overrides default", () => {
  const cfg = makeConfig();
  const result = resolveAuthPath(cfg, { HOME: home, CODEX_HOME: "/var/codex" });
  assert.equal(result, "/var/codex/auth.json");
});

test("default resolves to HOME when no overrides", () => {
  const cfg = makeConfig();
  const result = resolveAuthPath(cfg, { HOME: home });
  assert.equal(result, `${home}/.codex/auth.json`);
});
