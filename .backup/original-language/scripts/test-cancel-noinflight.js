#!/usr/bin/env node
// Test purpose: Verify that the server harmlessly ignores notifications/cancelled 
// for requestId that doesn't exist in inflight, and other requests (ping) respond normally.
// Success: exit 0 for OK, exit 1 on failure.

import { spawn } from 'node:child_process';

function enc(obj){ const s=JSON.stringify(obj); return `Content-Length: ${Buffer.byteLength(s,'utf8')}\r\n\r\n${s}`; }

const child = spawn('node', ['build/index.js','--stdio'], {
  stdio: 'pipe',
  env: { ...process.env, DEBUG: '1' }
});

let okInitialize = false;
let okPing = false;

child.stdout.on('data', b => {
  const t = b.toString('utf8');
  // initialize 応答検出
  if (t.includes('"id":1') && t.includes('"result"')) okInitialize = true;
  // ping 応答検出
  if (t.includes('"id":2') && t.includes('"result":{}')) okPing = true;
  process.stdout.write(b);
});

child.stderr.on('data', b => process.stderr.write(b));

// initialize
child.stdin.write(enc({ jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2025-06-18', capabilities:{} } }));

// Cancellation notification with ID(999) that doesn't exist in inflight
setTimeout(() => {
  child.stdin.write(enc({ jsonrpc:'2.0', method:'notifications/cancelled', params:{ requestId: 999, reason: 'test-no-inflight' } }));
}, 100);

// ping は通常どおり成功すること
setTimeout(() => {
  child.stdin.write(enc({ jsonrpc:'2.0', id:2, method:'ping' }));
}, 200);

setTimeout(() => {
  try { child.kill(); } catch {}
  const ok = okInitialize && okPing;
  if (!ok) console.error('[test] cancel-noinflight: FAILED');
  process.exit(ok ? 0 : 1);
}, 1500);
