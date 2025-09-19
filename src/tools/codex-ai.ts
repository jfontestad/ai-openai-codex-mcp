import { callCodexExec } from './codex-exec.js';
import { PERSONAS } from '../personas/library.js';

type Thinking = 'low' | 'medium' | 'high';

export type CodexAIInput = {
  prompt: string;
  persona?: string;
  thinking?: Thinking;
  model?: string;
  profile?: string;
  max_output_tokens?: number;
  temperature?: number;
  enabled_tools?: string[]; // e.g., ['web-run']
  conversation_id?: string; // reserved for future multi-turn
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approval_policy?: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  cwd?: string;
  timeout_ms?: number;
  json_mode?: boolean;
  skip_git_repo_check?: boolean;
  code_only?: boolean;
  steps?: boolean;
};


function mkSystemPreface(inp: CodexAIInput): string {
  const personaKey = (inp.persona || '').toLowerCase();
  const p = PERSONAS[personaKey];
  const base = p ? `Persona: ${p.title}\n${p.instructions}` : 'Persona: Generalist Engineer\nBe concise, correct, and pragmatic.';
  const effort = (inp.thinking || 'high');
  const effortNote = `Reasoning effort: ${effort}. Present only what’s needed to act.`;
  const style: string[] = [];
  if (inp.code_only) style.push('Output code only unless asked otherwise. No prose.');
  if (inp.steps) style.push('When proposing actions, include a numbered step-by-step list.');
  return [base, effortNote, 'Do not mention tools or internal flags unless explicitly asked.', ...style].join('\n');
}

function mapReasoningEffort(thinking?: Thinking) {
  const v = (thinking || 'high');
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return 'high';
}

export async function callCodexAI(
  input: CodexAIInput,
  signal?: AbortSignal,
  onEvent?: (ev: any) => void
) {
  const system = mkSystemPreface(input);
  const parts: string[] = [system, '', 'User prompt:', input.prompt];
  const finalPrompt = parts.join('\n');

  const config: Record<string, any> = {};
  // Map conceptual knobs to Codex config overrides
  config.model_reasoning_effort = mapReasoningEffort(input.thinking);
  // Some models only accept 'detailed' for reasoning summary; use safest value.
  config.model_reasoning_summary = 'detailed';
  if (typeof input.max_output_tokens === 'number' && input.max_output_tokens > 0) {
    config.model_max_output_tokens = input.max_output_tokens;
  }
  if (typeof input.temperature === 'number') {
    config.model_temperature = input.temperature;
  }

  const search = Array.isArray(input.enabled_tools) && input.enabled_tools.includes('web-run');

  const out = await callCodexExec({
    prompt: finalPrompt,
    model: input.model,
    profile: input.profile,
    cwd: input.cwd || process.cwd(),
    sandbox: input.sandbox || 'read-only',
    approval_policy: input.approval_policy || 'on-failure',
    full_auto: false, // prefer explicit knobs
    skip_git_repo_check: input.skip_git_repo_check !== false, // default true
    json_mode: input.json_mode !== false, // default true
    // Default to 15 minutes for complex runs unless caller overrides
    timeout_ms: typeof input.timeout_ms === 'number' ? input.timeout_ms : 15 * 60 * 1000,
    // best-effort web search toggle; supported as a global flag by some Codex builds
    // For now, approximate via config; hub users may enable the codex MCP tool that has search baked in.
    // @ts-ignore reintroduce for codex-exec if supported
    search: search,
    config
  }, signal, onEvent);

  return out;
}

export const codexAIToolDef = {
  name: 'codex_ai',
  description: 'Persona-driven Codex execution with opinionated instructions and tuned settings (keyless).',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      persona: { type: 'string' },
      thinking: { enum: ['low','medium','high'] },
      model: { type: 'string' },
      profile: { type: 'string' },
      max_output_tokens: { type: 'number' },
      temperature: { type: 'number' },
      enabled_tools: { type: 'array', items: { type: 'string' } },
      conversation_id: { type: 'string' },
      sandbox: { enum: ['read-only','workspace-write','danger-full-access'] },
      approval_policy: { enum: ['untrusted','on-failure','on-request','never'] },
      cwd: { type: 'string' },
      timeout_ms: { type: 'number' },
      json_mode: { type: 'boolean' },
      skip_git_repo_check: { type: 'boolean' },
      code_only: { type: 'boolean' },
      steps: { type: 'boolean' }
    },
    required: ['prompt']
  }
} as const;
