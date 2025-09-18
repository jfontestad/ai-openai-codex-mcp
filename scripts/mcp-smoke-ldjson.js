#!/usr/bin/env node
// Line-delimited JSON (no Content-Length) minimal connectivity smoke test
// Send initialize -> tools/list and stream server responses directly to stdout
import { spawn } from "node:child_process";

const child = spawn("node", ["build/index.js", "--stdio"], { stdio: "pipe" });

child.stdout.on("data", (buf) => process.stdout.write(buf));
child.stderr.on("data", (buf) => process.stderr.write(buf));

function j(x) { return JSON.stringify(x); }

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: { roots: {} },
    clientInfo: { name: "smoke-ldjson", version: "0" }
  }
};
const list = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };

// Send as line-delimited JSON (without Content-Length)
child.stdin.write(j(init) + "\n", "utf8");
setTimeout(() => child.stdin.write(j(list) + "\n", "utf8"), 100);

// Terminate (kill after short time)
setTimeout(() => { try { child.kill(); } catch {} }, 1500);
