// Multi-profile compatible tool definitions
export const AVAILABLE_PROFILES = [
  "answer",           // Standard profile (required)
  "answer_detailed",  // Detailed analysis profile
  "answer_quick"      // Fast profile
] as const;

export const TOOL_DEFINITIONS = {
  answer: {
    name: "answer",
    description: "Search the web when needed and provide balanced, well-sourced answers. This is the standard general-purpose tool.",
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
  },
  
  answer_detailed: {
    name: "answer_detailed", 
    description: "Perform comprehensive analysis with thorough research and detailed explanations. Best for complex questions requiring deep investigation.",
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
  },
  
  answer_quick: {
    name: "answer_quick",
    description: "Provide fast, concise answers optimized for speed. Best for simple lookups or urgent questions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  }
  ,
  codex_exec: {
    name: "codex_exec",
    description: "Run a non-interactive Codex session via CLI (no API key required).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        model: { type: "string" },
        profile: { type: "string" },
        cwd: { type: "string" },
        sandbox: { enum: ["read-only","workspace-write","danger-full-access"] },
        full_auto: { type: "boolean" },
        skip_git_repo_check: { type: "boolean" },
        approval_policy: { enum: ["untrusted","on-failure","on-request","never"] },
        json_mode: { type: "boolean" },
        timeout_ms: { type: "number" },
        config: { type: "object", additionalProperties: true }
      },
      required: ["prompt"]
    }
  }
  ,
  codex_ai: {
    name: "codex_ai",
    description: "Persona-driven Codex execution with tuned instructions (keyless, single-turn).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        persona: { type: "string" },
        thinking: { enum: ["low","medium","high"] },
        model: { type: "string" },
        profile: { type: "string" },
        max_output_tokens: { type: "number" },
        temperature: { type: "number" },
        enabled_tools: { type: "array", items: { type: "string" } },
        conversation_id: { type: "string" },
        sandbox: { enum: ["read-only","workspace-write","danger-full-access"] },
        approval_policy: { enum: ["untrusted","on-failure","on-request","never"] },
        cwd: { type: "string" },
        timeout_ms: { type: "number" },
        json_mode: { type: "boolean" },
        skip_git_repo_check: { type: "boolean" }
      },
      required: ["prompt"]
    }
  }
} as const;
