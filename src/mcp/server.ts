import { readMessages, writeMessage } from "./protocol.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { callAnswer } from "../tools/answer.js";
import { callCodexExec } from "../tools/codex-exec.js";
import { callCodexAI } from "../tools/codex-ai.js";
import { TOOL_DEFINITIONS } from "../tools/tool-definitions.js";
import type { Config } from "../config/defaults.js";
import { isDebug } from "../debug/state.js";
import { appendEvent as hxAppend } from "../history/store.js";

type JsonRpc = {
  jsonrpc?: "2.0";
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
};

const PROTOCOL = "2025-06-18";
const __dirname = dirname(fileURLToPath(import.meta.url));
function ts(): string { return new Date().toISOString(); }
function logInfo(msg: string): void { console.error(`[mcp] ${ts()} INFO ${msg}`); }
function logError(msg: string): void { console.error(`[mcp] ${ts()} ERROR ${msg}`); }
function pkgVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}
// Debug determination unified to common isDebug()

function sendResult(id: number | string, result: any) {
  writeMessage({ jsonrpc: "2.0", id, result });
}
function sendError(id: number | string, code: number, message: string, data?: any) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message, data } });
}

export function startServer(cfg: Config) {
  if (isDebug()) logInfo(`server.start pid=${process.pid}`);
  // In-flight requests: id -> { controller, cancelled }
  const inflight = new Map<number | string, { controller: AbortController; cancelled: boolean }>();
  // Startup summary (stderr, doesn't pollute MCP stdout)
  try {
    const srv: any = (cfg as any).server || {};
    const mp: any = (cfg as any).model_profiles?.answer || {};
    const rq: any = (cfg as any).request || {};
    const sh = !!srv.show_config_on_start;
    if (isDebug() || sh) {
      logInfo(`config summary: model(answer)=${mp.model ?? '-'} effort=${mp.reasoning_effort ?? '-'} verbosity=${mp.verbosity ?? '-'} timeout_ms=${rq.timeout_ms ?? '-'} retries=${rq.max_retries ?? '-'}`);
      const pol: any = (cfg as any).policy?.system || {};
      if (pol?.source === 'file') logInfo(`policy: source=file path=${pol.path ?? ''} merge=${pol.merge ?? 'replace'}`);
    }
  } catch {}
  readMessages(async (raw: any) => {
    const msg = raw as JsonRpc;
    if (isDebug()) {
      const method = msg?.method || (msg?.result ? "<result>" : msg?.error ? "<error>" : "<unknown>");
      logInfo(`recv method=${method} id=${String(msg?.id ?? "-")}`);
    }

    if (msg.method === "initialize" && msg.id !== undefined) {
      const res = {
        protocolVersion: PROTOCOL,
        // This server doesn't implement roots, so don't advertise it (tools only)
        capabilities: { tools: {} },
        serverInfo: { name: "openai-responses-mcp", version: pkgVersion() }
      };
      if (isDebug()) logInfo(`initialize -> ok`);
      sendResult(msg.id, res);
      return;
    }

    if (msg.method === "tools/list" && msg.id !== undefined) {
      let tools = Object.values(TOOL_DEFINITIONS);
      try {
        const expose = (cfg as any)?.server?.expose_answer_tools !== false;
        if (!expose) {
          tools = tools.filter((t: any) => !['answer','answer_detailed','answer_quick'].includes(t?.name));
        }
      } catch {}
      if (isDebug()) logInfo(`tools/list -> ${tools.length} tools`);
      sendResult(msg.id, { tools });
      return;
    }

    if (msg.method === "tools/call" && msg.id !== undefined) {
      const { name, arguments: args } = (msg.params || {}) as { name?: string; arguments?: any };
      if (isDebug()) {
        try {
          const keys = Object.keys(args || {});
          const qlen = typeof (args?.query) === 'string' ? (args.query as string).length : undefined;
          logInfo(`tools/call name=${name} argsKeys=[${keys.join(',')}] queryLen=${qlen ?? '-'}`);
        } catch {}
      }
      if (name && name in TOOL_DEFINITIONS) {
        try {
          // Prepare AbortController for each request (interrupted by cancellation notification)
          const entry = { controller: new AbortController(), cancelled: false };
          inflight.set(msg.id, entry);
          let out: any;
          const expose = (cfg as any)?.server?.expose_answer_tools !== false;
          if ((name === 'answer' || name === 'answer_detailed' || name === 'answer_quick') && expose) {
            out = await callAnswer(args, cfg, name, entry.controller.signal);
          } else if (name === 'codex_exec') {
            const conv = (args?.conversation_id || args?.conversationId || null) as string | null;
            const d = (cfg as any).codex_defaults || {};
            const merged = {
              cwd: process.cwd(),
              sandbox: d.sandbox ?? 'read-only',
              approval_policy: d.approval_policy ?? 'on-failure',
              timeout_ms: d.timeout_ms ?? 15_000,
              json_mode: (d.json_mode ?? true),
              skip_git_repo_check: (d.skip_git_repo_check ?? true),
              ...args
            };
            const onEvent = (ev: any) => {
              try {
                const suppressFinal = String(process.env.CODEX_STREAM_SUPPRESS_FINAL || '').toLowerCase();
                const noFinal = (suppressFinal === '1' || suppressFinal === 'true' || suppressFinal === 'yes');
                const isFinal = ev?.type === 'agent_message';
                if (ev?.type === 'agent_message_delta' || ev?.type === 'token_count' || (!noFinal && isFinal)) {
                  writeMessage({ jsonrpc: '2.0', method: 'notifications/progress', params: { requestId: msg.id, tool: name, event: ev } });
                  writeMessage({ jsonrpc: '2.0', method: 'codex/event', params: { requestId: msg.id, tool: name, event: ev } });
                }
                if (conv) hxAppend(conv, { tool: name, event: ev });
              } catch {}
            };
            out = await callCodexExec(merged as any, entry.controller.signal, onEvent);
          } else if (name === 'codex_ai') {
            const conv = (args?.conversation_id || args?.conversationId || null) as string | null;
            const d = (cfg as any).codex_defaults || {};
            const merged = {
              cwd: process.cwd(),
              sandbox: d.sandbox ?? 'read-only',
              approval_policy: d.approval_policy ?? 'on-failure',
              timeout_ms: d.timeout_ms ?? 900_000,
              json_mode: (d.json_mode ?? true),
              skip_git_repo_check: (d.skip_git_repo_check ?? true),
              ...args
            };
            const onEvent = (ev: any) => {
              try {
                const suppressFinal = String(process.env.CODEX_STREAM_SUPPRESS_FINAL || '').toLowerCase();
                const noFinal = (suppressFinal === '1' || suppressFinal === 'true' || suppressFinal === 'yes');
                const isFinal = ev?.type === 'agent_message';
                if (ev?.type === 'agent_message_delta' || ev?.type === 'token_count' || (!noFinal && isFinal)) {
                  writeMessage({ jsonrpc: '2.0', method: 'notifications/progress', params: { requestId: msg.id, tool: name, event: ev } });
                  writeMessage({ jsonrpc: '2.0', method: 'codex/event', params: { requestId: msg.id, tool: name, event: ev } });
                }
                if (conv) hxAppend(conv, { tool: name, event: ev });
              } catch {}
            };
            out = await callCodexAI(merged as any, entry.controller.signal, onEvent);
            if (conv) hxAppend(conv, { tool: name, final: out });
          } else {
            throw new Error(`unsupported tool: ${name}`);
          }
          // Suppress response if cancelled
          const cur = inflight.get(msg.id) || entry;
          const abortedNow = cur.cancelled || cur.controller.signal.aborted;
          if (abortedNow) {
            if (isDebug()) logInfo(`tools/call(${name}) cancelled -> suppress response`);
            inflight.delete(msg.id);
            return;
          }
          if (isDebug()) logInfo(`tools/call(${name}) -> ok`);
          sendResult(msg.id, { content: [{ type: "text", text: JSON.stringify(out) }] });
          inflight.delete(msg.id);
        } catch (e: any) {
          const dbg = isDebug();
          let status: any = '-';
          let etype: any = '-';
          let ename: any = '-';
          let emsg: string = e?.message || String(e);
          // Suppress errors after cancellation (no response)
          const cur = inflight.get(msg.id);
          const aborted = cur?.cancelled || cur?.controller?.signal?.aborted;
          if (aborted) {
            if (dbg) {
              try { logInfo(`tools/call(${name}) aborted -> suppress error response`); } catch {}
            }
            inflight.delete(msg.id);
            return;
          }
          if (dbg) {
            try {
              status = (e && (e.status ?? e.code)) ?? '-';
              ename = e?.name ?? '-';
              etype = e?.error?.type ?? '-';
              emsg = (e?.message ?? String(e)).slice(0, 400);
              logError(`tools/call(${name}) -> error status=${status} type=${etype} name=${ename} msg="${emsg}"`);
            } catch {}
          }
          const data = dbg
            ? { message: emsg, status, type: etype, name: ename }
            : { message: e?.message || String(e) };
          sendError(msg.id, -32001, "answer failed", data);
        }
      } else {
        if (isDebug()) logError(`unknown tool: ${name}`);
        sendError(msg.id, -32601, "Unknown tool");
      }
      return;
    }

    // Cancellation notification (notification only, no response needed)
    if (msg.method === "notifications/cancelled") {
      try {
        const rid = (msg?.params as any)?.requestId;
        const reason = (msg?.params as any)?.reason;
        if (rid !== undefined && inflight.has(rid)) {
          const e = inflight.get(rid)!;
          e.cancelled = true;
          try { e.controller.abort(); } catch {}
          if (isDebug()) logInfo(`cancelled requestId=${String(rid)} reason=${reason ?? '-'} -> abort signaled`);
        } else {
          if (isDebug()) logInfo(`cancelled requestId=${String(rid)} (no inflight)`);
        }
      } catch {}
      return;
    }

    // ping (health check) minimal implementation
    if (msg.method === "ping") {
      if (isDebug()) logInfo(`recv method=ping id=${String(msg?.id ?? '-')}`);
      if (msg.id !== undefined) {
        // Empty object is OK (implementation-dependent according to spec).
        sendResult(msg.id, {});
      }
      return;
    }

    if (msg.id !== undefined) {
      if (isDebug()) logError(`unknown method: ${msg.method}`);
      sendError(msg.id, -32601, "Unknown method");
    }
  });
}
