import { strict as assert } from "node:assert";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { defaults } from "../src/config/defaults.js";
import { CodexAuthLoader } from "../src/codex/loader.js";

function makeTmpCodexHome(): string {
  return mkdtempSync(join(tmpdir(), "codex-home-"));
}

function writeAuth(dir: string, contents: object) {
  const path = join(dir, "auth.json");
  writeFileSync(path, JSON.stringify(contents), "utf8");
  try {
    if (process.platform !== "win32") {
      chmodSync(path, 0o600);
    }
  } catch {
    // ignore
  }
}

test("loader returns OAuth token and caches result", async () => {
  const codexHome = makeTmpCodexHome();
  try {
    writeAuth(codexHome, {
      tokens: {
        access_token: "oauth-access",
        refresh_token: "oauth-refresh",
        id_token: "header.payload.sig"
      },
      last_refresh: new Date().toISOString()
    });

    const loader = new CodexAuthLoader({
      config: defaults.codex,
      env: { CODEX_HOME: codexHome },
      openaiBaseUrl: defaults.openai.base_url,
      logger: quietLogger,
      cli: fakeCli(),
      validator: alwaysValid
    });

    const first = await loader.getToken();
    assert.equal(first.kind, "oauth");
    assert.equal(first.accessToken, "oauth-access");
    assert.equal(first.refreshToken, "oauth-refresh");
    const second = await loader.getToken();
    assert.equal(second, first, "should reuse cached object");
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
});

test("loader falls back to API key when tokens missing", async () => {
  const codexHome = makeTmpCodexHome();
  try {
    writeAuth(codexHome, {
      OPENAI_API_KEY: "sk-test"
    });

    const loader = new CodexAuthLoader({
      config: defaults.codex,
      env: { CODEX_HOME: codexHome },
      openaiBaseUrl: defaults.openai.base_url,
      logger: quietLogger,
      cli: fakeCli(),
      validator: alwaysValid
    });

    const result = await loader.getToken();
    assert.equal(result.kind, "api_key");
    assert.equal(result.accessToken, "sk-test");
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
});

test("loader triggers codex login when auth missing", async () => {
  const codexHome = makeTmpCodexHome();
  const cli = fakeCli({
    login: async () => {
      writeAuth(codexHome, {
        tokens: {
          access_token: "fresh",
          refresh_token: "ref",
          id_token: "header.payload.sig"
        },
        last_refresh: new Date().toISOString()
      });
      return { ok: true };
    }
  });

  const loader = new CodexAuthLoader({
    config: defaults.codex,
    env: { CODEX_HOME: codexHome },
    openaiBaseUrl: defaults.openai.base_url,
    logger: quietLogger,
    cli,
    validator: alwaysValid
  });

  const result = await loader.getToken();
  assert.equal(cli.stats.login, 1);
  assert.equal(result.accessToken, "fresh");
});

test("loader enforces strict permissions", async () => {
  if (process.platform === "win32") {
    return;
  }
  const codexHome = makeTmpCodexHome();
  try {
    const authPath = join(codexHome, "auth.json");
    writeAuth(codexHome, {
      tokens: {
        access_token: "token",
        refresh_token: "refresh",
        id_token: "header.payload.sig"
      },
      last_refresh: new Date().toISOString()
    });
    // Make world-readable
    const fs = await import("node:fs");
    fs.chmodSync(authPath, 0o666);

    const loader = new CodexAuthLoader({
      config: { ...defaults.codex, permissionStrict: true },
      env: { CODEX_HOME: codexHome },
      openaiBaseUrl: defaults.openai.base_url,
      logger: quietLogger,
      cli: fakeCli(),
      validator: alwaysValid
    });

    await assert.rejects(async () => loader.getToken(), /permissions/i);
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
});

const quietLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
} as const;

type CliOverrides = {
  refresh?: () => Promise<{ ok: boolean }>;
  login?: () => Promise<{ ok: boolean }>;
};

function fakeCli(overrides: CliOverrides = {}) {
  const stats = { refresh: 0, login: 0 };
  return {
    stats,
    refresh: async () => {
      stats.refresh += 1;
      return overrides.refresh ? overrides.refresh() : { ok: true };
    },
    login: async () => {
      stats.login += 1;
      return overrides.login ? overrides.login() : { ok: true };
    }
  };
}

const alwaysValid = {
  validate: async () => true
};

test("validation obeys rate limiting", async () => {
  const codexHome = makeTmpCodexHome();
  try {
    writeAuth(codexHome, {
      tokens: {
        access_token: "valid-token",
        refresh_token: "refresh",
        id_token: "header.payload.sig"
      },
      last_refresh: new Date().toISOString()
    });

    let now = Date.now();
    let validates = 0;
    const validator = {
      validate: async () => {
        validates += 1;
        return true;
      }
    };

    const loader = new CodexAuthLoader({
      config: { ...defaults.codex, cacheTtlMs: 5, validationRateLimitMs: 1_000 },
      env: { CODEX_HOME: codexHome },
      openaiBaseUrl: defaults.openai.base_url,
      logger: quietLogger,
      cli: fakeCli(),
      validator,
      now: () => now
    });

    await loader.getToken();
    assert.equal(validates, 1);

    now += 10; // expire cache but still under rate limit window
    const second = await loader.getToken();
    assert.equal(second.accessToken, "valid-token");
    assert.equal(validates, 1, "should skip validation due to rate limit");
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
});

test("stale tokens trigger codex refresh", async () => {
  const codexHome = makeTmpCodexHome();
  try {
    const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    writeAuth(codexHome, {
      tokens: {
        access_token: "old",
        refresh_token: "refresh-old",
        id_token: "header.payload.sig"
      },
      last_refresh: staleDate.toISOString()
    });

    const cli = fakeCli({
      refresh: async () => {
        writeAuth(codexHome, {
          tokens: {
            access_token: "new-token",
            refresh_token: "new-refresh",
            id_token: "header.payload.sig"
          },
          last_refresh: new Date().toISOString()
        });
        return { ok: true };
      }
    });

    const loader = new CodexAuthLoader({
      config: defaults.codex,
      env: { CODEX_HOME: codexHome },
      openaiBaseUrl: defaults.openai.base_url,
      logger: quietLogger,
      cli,
      validator: alwaysValid
    });

    const result = await loader.getToken();
    assert.equal(cli.stats.refresh, 1);
    assert.equal(result.accessToken, "new-token");
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
});
