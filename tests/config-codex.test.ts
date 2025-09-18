import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig } from "../src/config/load.js";

const baseEnv = { ...process.env };

function makeEnv(env: Record<string, string | undefined>) {
  return { ...baseEnv, ...env };
}

test("codex config defaults are populated", () => {
  const { effective } = loadConfig({ cli: {}, env: makeEnv({}) });
  assert.ok(effective.codex, "codex config should exist");
  assert.equal(effective.codex.enabled, true);
  assert.equal(effective.codex.authPath, "~/.codex/auth.json");
  assert.equal(effective.codex.autoRefresh, true);
  assert.equal(effective.codex.permissionStrict, true);
  assert.equal(effective.codex.cacheTtlMs, 5 * 60_000);
  assert.equal(effective.codex.cacheMaxEntries, 4);
  assert.equal(effective.codex.validationRateLimitMs, 5 * 60_000);
});

test("codex config respects overrides from YAML", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-config-"));
  try {
    const path = join(dir, "config.yaml");
    writeFileSync(
      path,
      `codex:\n  enabled: false\n  authPath: ~/custom/auth.json\n  autoRefresh: false\n  permissionStrict: false\n  cacheTtlMs: 1000\n  cacheMaxEntries: 1\n  validationRateLimitMs: 100\n  healthCheckPort: 8123\n`,
      "utf8"
    );
    const { effective } = loadConfig({ cli: { configPath: path }, env: makeEnv({}) });
    assert.equal(effective.codex.enabled, false);
    assert.equal(effective.codex.authPath, "~/custom/auth.json");
    assert.equal(effective.codex.autoRefresh, false);
    assert.equal(effective.codex.permissionStrict, false);
    assert.equal(effective.codex.cacheTtlMs, 1000);
    assert.equal(effective.codex.cacheMaxEntries, 1);
    assert.equal(effective.codex.validationRateLimitMs, 100);
    assert.equal(effective.codex.healthCheckPort, 8123);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
