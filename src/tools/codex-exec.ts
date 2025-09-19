import { spawn } from "node:child_process";

export type CodexExecInput = {
  prompt: string;
  model?: string;
  profile?: string;
  cwd?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  full_auto?: boolean;
  skip_git_repo_check?: boolean;
  approval_policy?: "untrusted" | "on-failure" | "on-request" | "never";
  json_mode?: boolean;            // When true, use codex --json and return only the final agent message
  timeout_ms?: number;            // Kill the codex process after this many ms (0/undefined -> no extra timeout)
  config?: Record<string, any>; // dotted paths -> value
};

export type CodexEvent =
  | { type: 'agent_message_delta'; delta: string }
  | { type: 'agent_message'; message: string }
  | { type: 'token_count'; info: any }
  | { type: 'raw'; line: string };

export async function callCodexExec(
  input: CodexExecInput,
  signal?: AbortSignal,
  onEvent?: (ev: CodexEvent) => void
) {
  const cmd = process.env.CODEX_CLI_PATH || "codex";
  const args: string[] = ["exec"];

  if (input.model) args.push("-m", input.model);
  if (input.profile) args.push("-p", input.profile);
  if (input.cwd) args.push("-C", input.cwd);
  // Precedence: explicit sandbox overrides --full-auto convenience
  if (input.full_auto && !input.sandbox) args.push("--full-auto");
  if (input.sandbox) args.push("-s", input.sandbox);
  if (input.skip_git_repo_check) args.push("--skip-git-repo-check");
  if (input.approval_policy) args.push("-c", `approval_policy=${JSON.stringify(input.approval_policy)}`);
  if (input.config) {
    for (const [k, v] of Object.entries(input.config)) {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      args.push("-c", `${k}=${val}`);
    }
  }
  // Prompt as trailing argument
  args.push(input.prompt);

  // Prefer JSONL event mode for lower payloads and faster parsing unless explicitly disabled
  const jsonMode = input.json_mode !== false; // default true
  if (jsonMode) args.push("--json");

  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

  let stdout = "";
  let stderr = "";
  let stdoutLinesBuf = "";
  let lastAccumulatedMessage: string | null = null;
  let lastAccumulatedTokens: any = null;
  child.stdout.on("data", (b) => {
    const chunk = b.toString("utf8");
    if (!jsonMode) { stdout += chunk; return; }
    stdoutLinesBuf += chunk;
    // Incremental parse and forward events to onEvent
    let idx: number;
    while ((idx = stdoutLinesBuf.indexOf("\n")) !== -1) {
      const line = stdoutLinesBuf.slice(0, idx).trim();
      stdoutLinesBuf = stdoutLinesBuf.slice(idx + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line);
        const t = ev?.type || ev?.msg?.type;
        if (t === 'agent_message_delta') {
          const d = ev?.delta ?? ev?.msg?.delta;
          if (typeof d === 'string') {
            onEvent?.({ type: 'agent_message_delta', delta: d });
            lastAccumulatedMessage = (lastAccumulatedMessage ?? '') + d;
          }
        } else if (t === 'agent_message') {
          const m = ev?.message ?? ev?.msg?.message;
          if (typeof m === 'string') {
            onEvent?.({ type: 'agent_message', message: m });
            lastAccumulatedMessage = m;
          }
        } else if (t === 'token_count') {
          const info = ev?.info ?? ev?.msg?.info ?? null;
          onEvent?.({ type: 'token_count', info });
          if (info) lastAccumulatedTokens = info;
        } else {
          onEvent?.({ type: 'raw', line });
        }
      } catch {
        onEvent?.({ type: 'raw', line });
      }
    }
  });
  child.stderr.on("data", (b) => { stderr += b.toString("utf8"); });

  const killed = new Promise<never>((_, rej) => {
    if (!signal) return;
    const onAbort = () => {
      try { child.kill("SIGTERM"); } catch {}
      const e: any = new Error("Aborted");
      e.name = "AbortError";
      rej(e);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

  let to: NodeJS.Timeout | null = null;
  const finished = new Promise<{ code: number | null }>((resolve) => {
    child.on("close", (code) => { if (to) clearTimeout(to); resolve({ code }); });
  });
  const timeoutBudget = typeof input.timeout_ms === 'number' ? input.timeout_ms : 15_000;
  if (timeoutBudget > 0) {
    to = setTimeout(() => { try { child.kill("SIGTERM"); } catch {} }, timeoutBudget);
  }

  const { code } = await Promise.race([finished, killed]);
  if (!jsonMode) {
    return { output: stdout.trim(), stderr: stderr.trim(), code };
  }

  // Parse JSONL events to extract the final agent message (+ optional token usage)
  let lastMessage: string | null = lastAccumulatedMessage;
  let totalTokens: any = lastAccumulatedTokens;
  const flush = stdoutLinesBuf.split(/\r?\n/);
  for (const line of flush) {
    const s = line.trim(); if (!s) continue;
    try {
      const ev = JSON.parse(s);
      const t = ev?.type || ev?.msg?.type;
      if (t === 'agent_message' && typeof ev?.message === 'string') {
        lastMessage = ev.message;
      } else if (t === 'agent_message' && typeof ev?.msg?.message === 'string') {
        lastMessage = ev.msg.message;
      } else if (t === 'token_count') {
        totalTokens = ev?.info?.total_token_usage ?? ev?.total_token_usage ?? null;
      } else if (t === 'agent_message_delta') {
        // If streaming deltas only, accumulate them
        const d = ev?.delta || ev?.msg?.delta;
        if (typeof d === 'string') lastMessage = (lastMessage ?? '') + d;
      }
    } catch {
      // ignore malformed lines
    }
  }

  // Fallback when no structured message found
  if (!lastMessage) lastMessage = stdoutLinesBuf.trim() || null;

  return { message: lastMessage, tokens: totalTokens, stderr: stderr.trim(), code };
}

// Note: Tool schema is centralized in src/tools/tool-definitions.ts.
// This file intentionally exports only the runtime implementation.
