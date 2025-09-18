import type { Config } from "../config/defaults.js";
import { createClient, callResponsesWithRetry } from "../openai/client.js";
import { SYSTEM_POLICY } from "../policy/system-policy.js";
import { isDebug } from "../debug/state.js";
import { resolveSystemPolicy } from "../policy/resolve.js";

export type AnswerInput = {
  query: string;
  recency_days?: number;
  max_results?: number;
  domains?: string[];
  style?: "summary" | "bullets" | "citations-only";
};

type Citation = { url: string; title?: string; published_at?: string | null };
type AnswerOut = {
  answer: string;
  used_search: boolean;
  citations: Citation[];
  model: string;
};

function toHints(inp: AnswerInput, cfg: Config): string {
  const r = inp.recency_days ?? cfg.search.defaults.recency_days;
  const m = inp.max_results ?? cfg.search.defaults.max_results;
  const d = inp.domains && inp.domains.length ? ` domains: ${inp.domains.join(", ")}` : "";
  return `\n[Hints] recency_days=${r}, max_results=${m}.${d}`;
}

function extractOutputText(resp: any): string {
  if (resp.output_text) return resp.output_text;
  try {
    const parts = [];
    for (const o of resp.output || []) {
      if (o?.content) {
        for (const c of o.content) {
          if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
        }
      }
    }
    return parts.join("\n\n");
  } catch {
    return "";
  }
}

function extractCitations(resp: any): { citations: Citation[]; used: boolean } {
  const set = new Map<string, Citation>();
  let used = false;
  try {
    for (const o of resp.output || []) {
      if (o?.type === "web_search_call") used = true;
      if (o?.content) {
        for (const c of o.content) {
          const anns = c?.annotations || [];
          for (const an of anns) {
            if (an?.type === "url_citation" && an?.url) {
              used = true;
              const key = an.url;
              if (!set.has(key)) set.set(key, { url: an.url, title: an.title || undefined, published_at: null });
            }
          }
        }
      }
    }
  } catch {}
  return { citations: [...set.values()], used };
}

// `signal` is used to propagate MCP cancellation
export async function callAnswer(input: AnswerInput, cfg: Config, profileName?: string, signal?: AbortSignal) {
  const client = await createClient(cfg);
  // SSOT (src/policy/system-policy.ts) as default, compose external policy.md if needed
  const system = resolveSystemPolicy(cfg);
  const userText = `${input.query}${toHints(input, cfg)}`;

  // Get profile configuration (use answer profile if none specified)
  const effectiveProfileName = profileName || 'answer';
  const profile = cfg.model_profiles[effectiveProfileName as keyof typeof cfg.model_profiles] || cfg.model_profiles.answer;
  
  if (!profile) {
    throw new Error(`model_profiles.${effectiveProfileName} is required`);
  }

  // Model compatibility check
  const supportsVerbosity = profile.model.startsWith('gpt-5');
  const supportsReasoningEffort = profile.model.startsWith('gpt-5') ||
                                  profile.model.startsWith('o3') ||
                                  profile.model.startsWith('o4');

  const requestBody: any = {
    model: profile.model,
    instructions: system,
    input: [{ role: "user", content: [{ type: "input_text", text: userText }]}],
    tools: [{ type: "web_search" }]
  };

  // Apply profile settings (only for supported models)
  if (supportsVerbosity) {
    requestBody.text = { verbosity: profile.verbosity };
  }
  if (supportsReasoningEffort) {
    const effort = profile.reasoning_effort;
    requestBody.reasoning = { effort };
  }

  // DEBUG log: profile, supported features, transmission summary (unified determination)
  if (isDebug()) {
    try {
      const toolsOn = Array.isArray(requestBody.tools) && requestBody.tools.some((t: any) => t?.type === 'web_search');
      const reasoningOn = !!requestBody.reasoning;
      const textVerbOn = !!requestBody.text?.verbosity;
      console.error(`[answer] profile=${effectiveProfileName} model=${profile.model} supports={verbosity:${supportsVerbosity}, reasoning:${supportsReasoningEffort}}`);
      console.error(`[answer] request summary tools=web_search(${toolsOn ? 'on':'off'}) reasoning=${reasoningOn ? 'on':'off'} text.verbosity=${textVerbOn ? 'on':'off'}`);
    } catch {}
  }

  const { response, model } = await callResponsesWithRetry(client, cfg, requestBody, signal);

  const answer = extractOutputText(response);
  const { citations, used } = extractCitations(response);

  return {
    answer,
    used_search: used,
    citations: citations.slice(0, cfg.policy.max_citations),
    model
  };
}

export const answerToolDef = {
  name: "answer",
  description: "Search the web when needed and return answers with evidence and citations",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      recency_days: { type: "number" },
      max_results: { type: "number" },
      domains: { type: "array", items: { type: "string" } },
      style: { enum: ["summary","bullets","citations-only"] }
    },
    required: ["query"]
  }
};
