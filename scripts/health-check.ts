#!/usr/bin/env node
import { loadConfig } from "../src/config/load.js";
import { resolveOpenAICredentials, CredentialResolution } from "../src/openai/credentials.js";

function toExitCode(state: CredentialResolution["state"]): number {
  if (state === "healthy") return 0;
  if (state === "degraded") return 10;
  return 1;
}

async function main() {
  const { effective } = loadConfig({ cli: {}, env: process.env });
  const resolution = await resolveOpenAICredentials(effective, { env: process.env });

  const payload = {
    state: resolution.state,
    source: resolution.source,
    detail: resolution.detail,
    metadata: {
      path: resolution.metadata.path ?? null,
      lastRefresh: resolution.metadata.lastRefresh ?? null,
      fallbackReason: resolution.metadata.fallbackReason ?? null,
      timestamp: new Date().toISOString()
    }
  };

  console.log(JSON.stringify(payload, null, 2));
  process.exit(toExitCode(resolution.state));
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ state: "unhealthy", source: "cli_error", detail: message, metadata: { timestamp: new Date().toISOString() } }, null, 2));
  process.exit(1);
});
