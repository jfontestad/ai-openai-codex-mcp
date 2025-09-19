#!/usr/bin/env node
// Content-Length <-> NDJSON bridge for `codex mcp serve`.
// - Upstream (client -> bridge): Content-Length framed JSON-RPC
// - Downstream (bridge -> codex): NDJSON (one JSON per line)
// - Upstream (bridge -> client): Wrap each NDJSON line from codex into Content-Length
// Usage:
//   node scripts/codex-mcp-bridge.js
// Claude Desktop MCP entry can point at this script.

import { spawn } from 'node:child_process';

const BRIDGE_DEBUG = process.env.BRIDGE_DEBUG === '1' || process.env.DEBUG === '1';
const CODEX = process.env.CODEX_CLI_PATH || 'codex';

function dlog(msg){ if (BRIDGE_DEBUG) process.stderr.write(`[bridge] ${msg}\n`); }

// Launch codex mcp serve (NDJSON over stdio)
const child = spawn(CODEX, ['mcp','serve'], { stdio: ['pipe','pipe','pipe'] });
child.on('exit', (code, sig) => {
  dlog(`codex exited code=${code} sig=${sig || ''}`);
  try { process.exit(code ?? 1); } catch {}
});
child.stderr.on('data', b => process.stderr.write(b));

// Client stdin (Content-Length) -> codex stdin (NDJSON)
let inBuf = Buffer.alloc(0);
process.stdin.on('data', chunk => {
  inBuf = Buffer.concat([inBuf, chunk]);
  while (true) {
    // Find header end (CRLFCRLF preferred, allow LFLF)
    let headerEnd = inBuf.indexOf('\r\n\r\n');
    let sep = 4;
    if (headerEnd === -1) {
      const alt = inBuf.indexOf('\n\n');
      if (alt !== -1) { headerEnd = alt; sep = 2; }
    }
    if (headerEnd === -1) break;
    const header = inBuf.slice(0, headerEnd).toString('utf8');
    const m = header.match(/Content-Length:\s*(\d+)/i);
    if (!m) { inBuf = inBuf.slice(headerEnd + sep); continue; }
    const len = parseInt(m[1], 10);
    const bodyStart = headerEnd + sep;
    const bodyEnd = bodyStart + len;
    if (inBuf.length < bodyEnd) break; // wait more
    const json = inBuf.slice(bodyStart, bodyEnd).toString('utf8');
    inBuf = inBuf.slice(bodyEnd);
    dlog(`recv framed -> forward line (${len} bytes)`);
    child.stdin.write(json + '\n', 'utf8');
  }
});

// codex stdout (NDJSON) -> client stdout (Content-Length)
let outBuf = '';
child.stdout.on('data', chunk => {
  outBuf += chunk.toString('utf8');
  while (true) {
    const lf = outBuf.indexOf('\n');
    if (lf === -1) break;
    const line = outBuf.slice(0, lf).trim();
    outBuf = outBuf.slice(lf + 1);
    if (!line) continue;
    const len = Buffer.byteLength(line, 'utf8');
    dlog(`send line -> framed (${len} bytes)`);
    process.stdout.write(`Content-Length: ${len}\r\n\r\n` + line, 'utf8');
  }
});

process.on('SIGINT', () => { try { child.kill('SIGINT'); } catch {}; process.exit(130); });
process.on('SIGTERM', () => { try { child.kill('SIGTERM'); } catch {}; process.exit(143); });
