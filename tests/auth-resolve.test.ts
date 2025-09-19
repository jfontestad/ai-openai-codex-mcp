import { strict as assert } from "node:assert";
import { test } from "node:test";

import { defaults, Config } from "../src/config/defaults.js";
import { resolveOpenAICredentials } from "../src/openai/credentials.js";

function baseConfig(): Config {
  return JSON.parse(JSON.stringify(defaults));
}

test("resolveOpenAICredentials returns healthy for Codex OAuth", async () => {
  const cfg = baseConfig();
  const mockLoader = {
    getToken: async () => ({
      kind: "oauth" as const,
      accessToken: "token",
      refreshToken: "refresh",
      metadata: { path: "/tmp/auth.json", lastRefresh: "2025-09-01T00:00:00Z" }
    })
  };

  const result = await resolveOpenAICredentials(cfg, {
    env: {},
    dependencies: {
      createLoader: () => mockLoader as any
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });

  assert.equal(result.state, "healthy");
  assert.equal(result.source, "codex_oauth");
  assert.equal(result.apiKey, "token");
});

test("resolveOpenAICredentials returns degraded for Codex API key", async () => {
  const cfg = baseConfig();
  const result = await resolveOpenAICredentials(cfg, {
    env: {},
    dependencies: {
      createLoader: () => ({
        getToken: async () => ({
          kind: "api_key" as const,
          accessToken: "sk-test",
          metadata: { path: "/tmp/auth.json", lastRefresh: null }
        })
      }) as any
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });

  assert.equal(result.state, "degraded");
  assert.equal(result.source, "codex_api_key");
});

test("resolveOpenAICredentials prefers env when set (no Codex calls)", async () => {
  const cfg = baseConfig();
  let loaderCalls = 0;
  const result = await resolveOpenAICredentials(cfg, {
    env: { OPENAI_API_KEY: "sk-env" },
    dependencies: {
      createLoader: () => ({
        getToken: async () => {
          loaderCalls += 1;
          return { kind: "oauth", accessToken: "token", refreshToken: "r", metadata: { path: "/tmp/auth.json", lastRefresh: null } };
        }
      }) as any
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });

  assert.equal(loaderCalls, 0, "env should short-circuit Codex path");
  assert.equal(result.state, "healthy");
  assert.equal(result.source, "env_api_key");
  assert.equal(result.apiKey, "sk-env");
});

test("resolveOpenAICredentials unhealthy when nothing available", async () => {
  const cfg = baseConfig();
  const result = await resolveOpenAICredentials(cfg, {
    env: {},
    dependencies: {
      createLoader: () => ({
        getToken: async () => {
          throw new Error("no auth");
        }
      }) as any
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });

  assert.equal(result.state, "unhealthy");
  assert.equal(result.source, "missing");
  assert.equal(result.apiKey, undefined);
});

test("resolveOpenAICredentials healthy when Codex disabled and env set", async () => {
  const cfg = baseConfig();
  (cfg.codex as any).enabled = false;
  const result = await resolveOpenAICredentials(cfg, {
    env: { OPENAI_API_KEY: "sk-env" },
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });

  assert.equal(result.state, "healthy");
  assert.equal(result.source, "env_api_key");
});
