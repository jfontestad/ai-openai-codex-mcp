#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readFileSync, createWriteStream, mkdirSync } from "node:fs";
import { loadConfig } from "./config/load.js";
import { resolveConfigPath } from "./config/paths.js";
import { startServer } from "./mcp/server.js";
import { setDebug } from "./debug/state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

function ts(): string { return new Date().toISOString(); }
function logInfo(msg: string): void { console.error(`[mcp] ${ts()} INFO ${msg}`); }
function logError(msg: string): void { console.error(`[mcp] ${ts()} ERROR ${msg}`); }

type Opts = {
  help?: boolean;
  version?: boolean;
  showConfig?: boolean;
  stdio?: boolean;
  configPath?: string;
  // --debug [<path>] support
  debug?: boolean;
  debugPath?: string;
};

function parseArgs(argv: string[]): Opts {
  const o: Opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--version" || a === "-v") o.version = true;
    else if (a === "--show-config") o.showConfig = true;
    else if (a === "--stdio") o.stdio = true;
    else if (a === "--config") { o.configPath = argv[++i]; }
    else if (a.startsWith("--config=")) { o.configPath = a.split("=",2)[1]; }
    else if (a === "--debug") {
      // If token following --debug is a path (not starting with '-'), incorporate it
      const next = argv[i+1];
      if (next && !next.startsWith("-")) { o.debug = true; o.debugPath = next; i++; }
      else { o.debug = true; }
    }
    else if (a.startsWith("--debug=")) {
      const v = a.split("=",2)[1];
      if (v && v.length > 0) { o.debug = true; o.debugPath = v; } else { o.debug = true; }
    }
  }
  return o;
}

function usage(): void {
  console.log(`openai-responses-mcp (Step4)
Usage:
  openai-responses-mcp --help
  openai-responses-mcp --version
  openai-responses-mcp --show-config [--config <path>]
  openai-responses-mcp --stdio   # Start MCP stdio server

Notes:
  - Priority: CLI > ENV > YAML > TS defaults
  - Default YAML path: ~/.config/openai-responses-mcp/config.yaml (or %APPDATA%\openai-responses-mcp\config.yaml on Windows)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    console.log(pkg.version);
    process.exit(0);
  }
  if (args.help || process.argv.length <= 2) {
    usage();
    process.exit(0);
  }

  const loaded = loadConfig({
    cli: { configPath: resolveConfigPath(args.configPath) },
    env: process.env
  });

  // Handling of --show-config:
  // - When used alone: Output JSON to stderr and exit with 0
  // - When used with --stdio: Output JSON to stderr and continue server (don't pollute stdout)
  let showConfigPrinted = false;
  if (args.showConfig) {
    try {
      const out = {
        version: pkg.version,
        sources: loaded.sources,
        effective: loaded.effective
      };
      // Output to stderr to avoid polluting stdout
      console.error(JSON.stringify(out, null, 2));
      showConfigPrinted = true;
    } catch (e: any) {
      logError(`failed to render config: ${e?.message ?? e}`);
    }
    if (!args.stdio) {
      process.exit(0);
    }
  }
  if (args.stdio) {
    // Enable debug (priority: CLI > ENV > YAML)
    const yamlDbg = (loaded.effective.server as any)?.debug ? true : false;
    const yamlDbgFile = (loaded.effective.server as any)?.debug_file || null;

    // 1) Apply CLI with highest priority (specification: CLI/ENV/YAML are equivalent)
    if (args.debug) {
      loaded.effective.server.debug = true;
      if (args.debugPath) loaded.effective.server.debug_file = args.debugPath;
      // Also synchronize ENV (used for debug determination in transport layer)
      process.env.DEBUG = args.debugPath ? args.debugPath : '1';
    }

    // 2) If ENV (DEBUG) exists and not specified in CLI, apply it
    if (!args.debug && process.env.DEBUG && process.env.DEBUG.length > 0) {
      const v = String(process.env.DEBUG);
      loaded.effective.server.debug = true;
      if (v !== '1' && v.toLowerCase() !== 'true') loaded.effective.server.debug_file = v;
    }

    // 3) YAML (fill in missing parts at the end)
    if (!loaded.effective.server.debug && yamlDbg) loaded.effective.server.debug = true;
    if (!loaded.effective.server.debug_file && yamlDbgFile) loaded.effective.server.debug_file = yamlDbgFile;

    const dbgEnabled = !!loaded.effective.server.debug;
    const dbgFile = (loaded.effective.server as any).debug_file || null;

    // Apply to single determination (hereafter refer to isDebug())
    setDebug(dbgEnabled, dbgFile);

    // When debugging, output startup information to stderr (for troubleshooting with GUI clients)
    if (dbgEnabled) {
      logInfo(`starting stdio server pid=${process.pid}`);
      logInfo(`argv=${JSON.stringify(process.argv)}`);
      logInfo(`cwd=${process.cwd()}`);
      logInfo(`node=${process.version}`);
    }
    // Always emit a minimal readiness hint to stderr so users who start the
    // binary manually understand that stdio mode is waiting for a client.
    if (!dbgEnabled) {
      logInfo(`stdio mode ready: waiting for MCP client on stdin (send initialize). Set DEBUG=1 for verbose logs.`);
    }
    if (showConfigPrinted) {
      logInfo(`show-config printed to stderr (continuing)`);
    }
    process.on("uncaughtException", (e) => logError(`uncaughtException ${e}`));
    process.on("unhandledRejection", (e: any) => logError(`unhandledRejection ${e?.message ?? e}`));
    startServer(loaded.effective);
    return; // keep process alive
  }

  console.error("Unknown options. Try --help");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
