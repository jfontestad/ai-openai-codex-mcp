#!/usr/bin/env node
import { spawn } from 'node:child_process';

function send(child, obj) {
  const json = JSON.stringify(obj);
  child.stdin.write(`Content-Length: ${Buffer.byteLength(json,'utf8')}\r\n\r\n${json}`);
}

const child = spawn('node', ['build/index.js','--stdio'], { stdio: 'pipe' });
child.stdout.on('data', b => process.stdout.write(b));
child.stderr.on('data', b => process.stderr.write(b));

send(child, { jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2025-06-18', capabilities:{} } });
setTimeout(()=> send(child, { jsonrpc:'2.0', id:2, method:'ping' }), 100);
setTimeout(()=> { try { child.kill(); } catch {} }, 800);

