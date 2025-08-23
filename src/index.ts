#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readFileSync, createWriteStream, mkdirSync } from "node:fs";
import os from "node:os";
import { loadConfig } from "./config/load.js";
import { resolveConfigPath } from "./config/paths.js";
import { startServer } from "./mcp/server.js";

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
  // --debug [<path>] に対応
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
      // --debug に続くトークンがパス（先頭が'-'以外）なら取り込む
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

  // --show-config の扱い：
  // - 単独指定時: stderr にJSON出力し、0終了
  // - --stdio と併用時: stderr にJSON出力し、そのままサーバ継続（stdoutは汚さない）
  let showConfigPrinted = false;
  if (args.showConfig) {
    try {
      const out = {
        version: pkg.version,
        sources: loaded.sources,
        effective: loaded.effective
      };
      // stdout を汚さないため、stderr に出力
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
    // デバッグ有効化（優先度: CLI > ENV > YAML）
    const yamlDbg = (loaded.effective.server as any)?.debug ? true : false;
    const yamlDbgFile = (loaded.effective.server as any)?.debug_file || null;

    // 1) CLI を最優先で反映（仕様：CLI/ENV/YAML 同義）
    if (args.debug) {
      loaded.effective.server.debug = true;
      if (args.debugPath) loaded.effective.server.debug_file = args.debugPath;
      // ENV も同期（transport層のデバッグ判定で利用するため）
      process.env.DEBUG = args.debugPath ? args.debugPath : '1';
    }

    // 2) ENV（DEBUG）が存在し、CLIで未指定なら反映
    if (!args.debug && process.env.DEBUG && process.env.DEBUG.length > 0) {
      const v = String(process.env.DEBUG);
      loaded.effective.server.debug = true;
      if (v !== '1' && v.toLowerCase() !== 'true') loaded.effective.server.debug_file = v;
    }

    // 3) YAML（最後に不足分補完）
    if (!loaded.effective.server.debug && yamlDbg) loaded.effective.server.debug = true;
    if (!loaded.effective.server.debug_file && yamlDbgFile) loaded.effective.server.debug_file = yamlDbgFile;

    const dbgEnabled = !!loaded.effective.server.debug;
    const dbgFile = (loaded.effective.server as any).debug_file || null;

    // セットアップ（ファイル指定時はTEEでミラー）
    setupDebugFileSink(dbgEnabled, dbgFile);

    // デバッグ時は起動情報をstderrに出す（GUIクライアントでの切り分け用）
    if (dbgEnabled) {
      logInfo(`starting stdio server pid=${process.pid}`);
      logInfo(`argv=${JSON.stringify(process.argv)}`);
      logInfo(`cwd=${process.cwd()}`);
      logInfo(`node=${process.version}`);
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

// デバッグログのファイルシンク設定
function setupDebugFileSink(enabled: boolean, filePath: string | null): void {
  if (!enabled) return;
  if (!filePath) return; // 画面のみ（ファイルミラーなし）

  // パスとして扱う
  let p = filePath;
  if (p.startsWith("~")) p = os.homedir() + p.slice(1);
  const resolvedPath = resolve(p);

  let stream: import("node:fs").WriteStream | undefined;
  try {
    // 親ディレクトリを再帰作成（存在する場合は何もしない）
    try { mkdirSync(dirname(resolvedPath), { recursive: true }); } catch {}
    stream = createWriteStream(resolvedPath, { flags: "a", encoding: "utf8" });
  } catch (e: any) {
    // 失敗時は警告してフォールバック
    try { console.error(`[mcp] ${new Date().toISOString()} WARN failed to open debug file path=${resolvedPath} err=${e?.message ?? e}`); } catch {}
    return;
  }

  const origWrite = process.stderr.write.bind(process.stderr) as typeof process.stderr.write;
  // 画面と同等の出力をファイルにもミラー（TEE）
  process.stderr.write = ((chunk: any, encoding?: any, cb?: any) => {
    try {
      stream!.write(chunk as any);
    } catch {
      // ファイル書き込み失敗時も画面出力は継続
    }
    // 画面（元のstderr）へも出力
    return origWrite(chunk as any, encoding as any, cb as any);
  }) as any;

  // プロセス終了時にクローズ
  process.on("exit", () => {
    try { stream?.end(); } catch {}
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
