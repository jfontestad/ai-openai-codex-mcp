import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function hxDir(): string {
  const base = process.env.MCP_CHAT_HX_DIR || join(process.cwd(), '.chat-hx');
  try { mkdirSync(base, { recursive: true }); } catch {}
  return base;
}

export function appendEvent(conversationId: string, event: any) {
  if (!conversationId) return;
  const dir = hxDir();
  const path = join(dir, `${conversationId}.jsonl`);
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
  try { appendFileSync(path, line, { encoding: 'utf8' }); } catch {}
}

