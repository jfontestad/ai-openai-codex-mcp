#!/usr/bin/env node
// Simple smoke test: Hit answer_quick and visualize error.data on errors
// Usage: node scripts/mcp-smoke-quick.js "Today's Tokyo temperature"

import { spawn } from "node:child_process";

const query = process.argv.slice(2).join(" ") || "Today's Tokyo temperature";

function encode(msg) {
  const json = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

function start() {
  const child = spawn("node", ["build/index.js", "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, DEBUG: "1" } // DEBUG 有効化
  });

  let buf = Buffer.alloc(0);
  child.stdout.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    // Content-Length フレーミングの単純パーサ
    while (true) {
      const headerEnd = buf.indexOf(Buffer.from("\r\n\r\n"));
      if (headerEnd === -1) break;
      const header = buf.slice(0, headerEnd).toString("utf8");
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) { console.log("<no content-length header>\n" + header); return; }
      const len = parseInt(m[1], 10);
      const start = headerEnd + 4;
      if (buf.length < start + len) break; // Still insufficient
      const body = buf.slice(start, start + len).toString("utf8");
      buf = buf.slice(start + len);
      try {
        const msg = JSON.parse(body);
        if (msg?.error) {
          console.log("[tools/call error]\n" + JSON.stringify(msg.error, null, 2));
        } else if (msg?.result) {
          console.log("[tools/call result]\n" + JSON.stringify(msg.result, null, 2));
        } else {
          // initialize / tools/list etc.
          console.log("[message]\n" + JSON.stringify(msg, null, 2));
        }
      } catch (e) {
        console.error("[parse error]", e.message);
      }
    }
  });

  child.stderr.on("data", (buf) => process.stderr.write(buf));

  // initialize → tools/list → tools/call(answer_quick)
  child.stdin.write(encode({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } }));
  setTimeout(() => {
    child.stdin.write(encode({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
  }, 80);
  setTimeout(() => {
    child.stdin.write(encode({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "answer_quick", arguments: { query } } }));
  }, 160);
  setTimeout(() => child.kill(), 4000);
}

start();
