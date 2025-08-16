import OpenAI from "openai";
import { Config } from "../config/defaults.js";

export function createClient(cfg: Config) {
  const apiKey = process.env[cfg.openai.api_key_env];
  if (!apiKey) {
    throw new Error(`Missing API key: set ${cfg.openai.api_key_env}`);
  }
  const client = new OpenAI({
    apiKey,
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

export async function callResponsesWithRetry(client: OpenAI, cfg: Config, args: CallArgs) {
  const timeoutMs = cfg.request.timeout_ms;
  const maxRetries = cfg.request.max_retries;
  let lastError: any;

  // model_profiles構造に基づくリトライ（フォールバック機能削除）
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await client.responses.create(args, { signal: controller.signal } as any);
      clearTimeout(to);
      return { response: resp, model: args.model };
    } catch (e: any) {
      lastError = e;
      // DEBUGは環境変数が非空であれば有効（"1"/"true"/任意のパス）
      const dv = (process.env.DEBUG_MCP ?? process.env.MCP_DEBUG ?? "").toString().toLowerCase();
      const isDebug = dv === '1' || dv === 'true' || dv.length > 0;
      if (isDebug) {
        try {
          const status = (e && (e.status ?? e.code)) ?? '-';
          const ename = e?.name ?? '-';
          const etype = e?.error?.type ?? '-';
          const emsg = (e?.message ?? String(e)).slice(0, 400);
          // OpenAI SDK APIError 互換で body を持つ場合、先頭のみ抜粋
          const bodyRaw: any = (e?.error ?? e?.response?.data ?? e?.response?.body ?? undefined);
          let bodyExcerpt = '';
          if (typeof bodyRaw === 'string') bodyExcerpt = bodyRaw.slice(0, 300);
          else if (bodyRaw && typeof bodyRaw === 'object') bodyExcerpt = JSON.stringify(bodyRaw).slice(0, 300);
          console.error(`[openai] error attempt=${attempt} status=${status} type=${etype} name=${ename} msg="${emsg}" body="${bodyExcerpt}"`);
        } catch {}
      }
      const retriable = (e?.status && (e.status === 429 || e.status >= 500)) || e?.name === "AbortError";
      if (!retriable || attempt === maxRetries) break;
      const backoff = 300 * Math.pow(2, attempt);
      await delay(backoff);
    }
  }
  throw lastError;
}
