import OpenAI from "openai";
import { isDebug } from "../debug/state.js";
import { Config } from "../config/defaults.js";
import { credentialLogger, resolveOpenAICredentials } from "./credentials.js";

export async function createClient(cfg: Config) {
  const resolution = await resolveOpenAICredentials(cfg, { env: process.env, logger: credentialLogger });

  if (resolution.state === "degraded") {
    credentialLogger.warn(resolution.detail);
  }

  if (!resolution.apiKey) {
    throw new Error(`Unable to obtain OpenAI credentials: ${resolution.detail}`);
  }

  if (isDebug()) {
    console.error(`[codex-auth] using source=${resolution.source} state=${resolution.state}`);
    // Proactive heads-up: JWT tokens from ChatGPT login often lack Responses scopes.
    try {
      if (resolution.source !== 'env_api_key' && resolution.apiKey.includes('.')) {
        const payloadPart = resolution.apiKey.split('.')[1] || '';
        const padded = payloadPart.padEnd(payloadPart.length + (4 - (payloadPart.length % 4)) % 4, '=');
        const json = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        const payload = JSON.parse(json);
        const scopes: string[] = Array.isArray(payload.scp) ? payload.scp : (typeof payload.scope === 'string' ? payload.scope.split(' ') : []);
        const hasResponses = scopes.some(s => s.startsWith('api.responses'));
        if (!hasResponses) {
          console.error('[codex-auth] warning: token appears to lack api.responses.* scopes; the Responses API may return 401. Prefer OPENAI_API_KEY or a token with Responses scopes.');
        }
      }
    } catch {}
  }

  const client = new OpenAI({
    apiKey: resolution.apiKey,
    baseURL: cfg.openai.base_url
  });
  return client;
}

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export type CallArgs = {
  model: string;
  instructions?: string;
  input: any;
  tools?: any[];
};

export async function callResponsesWithRetry(
  client: OpenAI,
  cfg: Config,
  args: CallArgs,
  externalSignal?: AbortSignal
) {
  const timeoutMs = cfg.request.timeout_ms;
  const maxRetries = cfg.request.max_retries;
  let lastError: any;

  // Retry based on model_profiles structure (fallback functionality removed)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Immediately abort if already cancelled
      if (externalSignal?.aborted) {
        const err = new Error("Aborted before request");
        (err as any).name = "AbortError";
        throw err;
      }

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      if (externalSignal) externalSignal.addEventListener('abort', onAbort);
      const to = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await client.responses.create(args, { signal: controller.signal } as any);
      clearTimeout(to);
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
      return { response: resp, model: args.model };
    } catch (e: any) {
      lastError = e;
      // Debug output based on single determination
      if (isDebug()) {
        try {
          const status = (e && (e.status ?? e.code)) ?? '-';
          const ename = e?.name ?? '-';
          const etype = e?.error?.type ?? '-';
          const emsg = (e?.message ?? String(e)).slice(0, 400);
          // When compatible with OpenAI SDK APIError with body, extract only the beginning
          const bodyRaw: any = (e?.error ?? e?.response?.data ?? e?.response?.body ?? undefined);
          let bodyExcerpt = '';
          if (typeof bodyRaw === 'string') bodyExcerpt = bodyRaw.slice(0, 300);
          else if (bodyRaw && typeof bodyRaw === 'object') bodyExcerpt = JSON.stringify(bodyRaw).slice(0, 300);
          console.error(`[openai] error attempt=${attempt} status=${status} type=${etype} name=${ename} msg="${emsg}" body="${bodyExcerpt}"`);
        } catch {}
      }
      const aborted = externalSignal?.aborted || e?.name === "AbortError" || e?.name === "APIUserAbortError";
      // Immediately abort on cancellation (no retries)
      if (aborted) break;
      const retriable = (e?.status && (e.status === 429 || e.status >= 500));
      if (!retriable || attempt === maxRetries) break;
      const backoff = 300 * Math.pow(2, attempt);
      await delay(backoff);
    }
  }
  throw lastError;
}
