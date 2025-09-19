#!/usr/bin/env node
// MCP Hub: merge Codex MCP and openai-responses-mcp under one stdio server.
// - Upstream (Claude) <-> Hub: Content-Length framing
// - Hub <-> Codex: NDJSON lines
// - Hub <-> Responses MCP: Content-Length framing

import { spawn } from 'node:child_process';

const DEBUG = process.env.HUB_DEBUG === '1' || process.env.DEBUG === '1';
const CODEX = process.env.CODEX_CLI_PATH || 'codex';
const RESP_CMD = process.env.RESP_CMD || 'node';
const RESP_ARGS = process.env.RESP_ARGS ? JSON.parse(process.env.RESP_ARGS) : [
  new URL('../build/index.js', import.meta.url).pathname,
  '--stdio'
];

function dlog(msg){ if (DEBUG) process.stderr.write(`[hub] ${msg}\n`); }

// ---- Helpers: Content-Length framing (client and responses child) ----
function toFrame(obj){ const s=JSON.stringify(obj); return `Content-Length: ${Buffer.byteLength(s,'utf8')}\r\n\r\n${s}`; }
function FrameReader(onMessage){
  let buf = Buffer.alloc(0);
  return (chunk)=>{
    buf = Buffer.concat([buf, chunk]);
    while (true){
      let headerEnd = buf.indexOf('\r\n\r\n');
      let sep=4;
      if (headerEnd===-1){ const alt=buf.indexOf('\n\n'); if (alt!==-1){ headerEnd=alt; sep=2; } }
      if (headerEnd===-1) break;
      const header = buf.slice(0, headerEnd).toString('utf8');
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m){ buf = buf.slice(headerEnd+sep); continue; }
      const len = parseInt(m[1],10);
      const bodyStart = headerEnd+sep; const bodyEnd = bodyStart+len;
      if (buf.length < bodyEnd) break;
      const json = buf.slice(bodyStart, bodyEnd).toString('utf8');
      buf = buf.slice(bodyEnd);
      try { onMessage(JSON.parse(json)); } catch {}
    }
  };
}

// ---- Children ----
// Codex MCP server (NDJSON)
const codex = spawn(CODEX, ['mcp','serve'], { stdio: ['pipe','pipe','pipe'] });
codex.stderr.on('data', b => process.stderr.write(b));
let codexOutBuf = '';
const codexSend = (obj) => { const s = JSON.stringify(obj); dlog(`codex<= ${s}`); codex.stdin.write(s+'\n','utf8'); };
const codexOnMessageCbs = [];
codex.stdout.on('data', (chunk)=>{
  codexOutBuf += chunk.toString('utf8');
  while (true){
    const lf = codexOutBuf.indexOf('\n'); if (lf===-1) break;
    const line = codexOutBuf.slice(0, lf).trim(); codexOutBuf = codexOutBuf.slice(lf+1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    dlog(`codex=> ${line}`);
    for (const cb of codexOnMessageCbs) cb(msg);
  }
});

// Responses MCP child (Content-Length)
const resp = spawn(RESP_CMD, RESP_ARGS, { stdio: ['pipe','pipe','pipe'] });
resp.stderr.on('data', b => process.stderr.write(b));
const respSend = (obj) => { const f = toFrame(obj); dlog(`resp<= ${obj.method || '<result>'}`); resp.stdin.write(f,'utf8'); };
const respOnMessageCbs = [];
resp.stdout.on('data', FrameReader((msg)=>{ dlog(`resp=> ${msg.method || msg.id}`); for (const cb of respOnMessageCbs) cb(msg); }));

// ---- Hub state ----
const toolToChild = new Map(); // toolName -> 'codex' | 'resp'
const inflight = new Map();    // requestId -> child ('codex' | 'resp')
let childrenInitialized = false;

function initChildren(){
  if (childrenInitialized) return;
  childrenInitialized = true;
  // Initialize both children with a basic handshake
  codexSend({ jsonrpc:'2.0', id: 1001, method:'initialize', params:{ protocolVersion:'2025-06-18', capabilities:{} } });
  respSend({ jsonrpc:'2.0', id: 2001, method:'initialize', params:{ protocolVersion:'2025-06-18', capabilities:{} } });
}

// Helper to fetch and merge tools from both children
async function fetchTools() {
  initChildren();
  const tools = [];
  const wait = [];
  wait.push(new Promise((resolve)=>{
    const id=1002; const handler=(msg)=>{ if (msg.id===id){ codexOnMessageCbs.splice(codexOnMessageCbs.indexOf(handler),1); if (msg.result?.tools) { for (const t of msg.result.tools){ tools.push({ ...t }); toolToChild.set(t.name,'codex'); } } resolve(); } };
    codexOnMessageCbs.push(handler);
    codexSend({ jsonrpc:'2.0', id, method:'tools/list', params:{} });
  }));
  wait.push(new Promise((resolve)=>{
    const id=2002; const handler=(msg)=>{ if (msg.id===id){ respOnMessageCbs.splice(respOnMessageCbs.indexOf(handler),1); if (msg.result?.tools) { for (const t of msg.result.tools){ tools.push({ ...t }); toolToChild.set(t.name,'resp'); } } resolve(); } };
    respOnMessageCbs.push(handler);
    respSend({ jsonrpc:'2.0', id, method:'tools/list', params:{} });
  }));
  await Promise.all(wait);
  return tools;
}

// ---- Upstream (client) handling ----
process.stdin.on('data', FrameReader(async (msg)=>{
  const { id, method } = msg;
  if (method === 'initialize' && id !== undefined){
    // Initialize children lazily and reply OK
    initChildren();
    const result = { protocolVersion:'2025-06-18', capabilities:{ tools:{} }, serverInfo:{ name:'codex-responses-hub', version:'0.1.0' } };
    process.stdout.write(toFrame({ jsonrpc:'2.0', id, result }),'utf8');
    return;
  }
  if (method === 'tools/list' && id !== undefined){
    const tools = await fetchTools();
    process.stdout.write(toFrame({ jsonrpc:'2.0', id, result:{ tools } }), 'utf8');
    return;
  }
  if (method === 'tools/call' && id !== undefined){
    const name = msg?.params?.name;
    const child = toolToChild.get(name);
    inflight.set(id, child);
    if (child === 'codex'){
      const handler=(m)=>{ if (m.id===id){ codexOnMessageCbs.splice(codexOnMessageCbs.indexOf(handler),1); process.stdout.write(toFrame({ jsonrpc:'2.0', id, result: m.result, error: m.error })); inflight.delete(id); } };
      codexOnMessageCbs.push(handler);
      codexSend({ jsonrpc:'2.0', id, method:'tools/call', params: msg.params });
      return;
    }
    if (child === 'resp'){
      const handler=(m)=>{ if (m.id===id){ respOnMessageCbs.splice(respOnMessageCbs.indexOf(handler),1); process.stdout.write(toFrame({ jsonrpc:'2.0', id, result: m.result, error: m.error })); inflight.delete(id); } };
      respOnMessageCbs.push(handler);
      respSend({ jsonrpc:'2.0', id, method:'tools/call', params: msg.params });
      return;
    }
    // Unknown tool
    process.stdout.write(toFrame({ jsonrpc:'2.0', id, error:{ code:-32601, message:'Unknown tool' } }));
    return;
  }
  if (method === 'notifications/cancelled'){
    const rid = msg?.params?.requestId;
    const child = inflight.get(rid);
    if (child === 'codex') codexSend({ jsonrpc:'2.0', method:'notifications/cancelled', params: msg.params });
    if (child === 'resp') respSend({ jsonrpc:'2.0', method:'notifications/cancelled', params: msg.params });
    return;
  }
  if (method === 'ping'){
    if (id !== undefined) process.stdout.write(toFrame({ jsonrpc:'2.0', id, result:{} }));
    return;
  }
  if (id !== undefined){
    process.stdout.write(toFrame({ jsonrpc:'2.0', id, error:{ code:-32601, message:'Unknown method' } }));
  }
}));

process.on('SIGINT', ()=>{ try{ codex.kill('SIGINT'); resp.kill('SIGINT'); }catch{} process.exit(130); });
process.on('SIGTERM', ()=>{ try{ codex.kill('SIGTERM'); resp.kill('SIGTERM'); }catch{} process.exit(143); });

