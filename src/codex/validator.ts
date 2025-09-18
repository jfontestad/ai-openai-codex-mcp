import { AuthKind, TokenValidator } from "./loader.js";

function decodePayload(token: string): any | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1];
  try {
    const padded = payload.padEnd(payload.length + (4 - (payload.length % 4)) % 4, "=");
    const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export class BasicTokenValidator implements TokenValidator {
  constructor(private readonly slackMs = 60_000) {}

  async validate(token: string, info: { kind: AuthKind; baseUrl: string }): Promise<boolean> {
    if (!token) return false;
    if (info.kind === "api_key") return token.startsWith("sk-") ? true : token.length > 0;

    const payload = decodePayload(token);
    if (!payload) return true;
    if (typeof payload.exp === "number") {
      const expiresAt = payload.exp * 1000;
      if (expiresAt <= Date.now() + this.slackMs) {
        return false;
      }
    }
    return true;
  }
}
