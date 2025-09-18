import { spawn } from "node:child_process";
import { once } from "node:events";

export interface CliRunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface CliOptions {
  env: NodeJS.ProcessEnv;
  logger: { info(message: string): void; warn(message: string): void; error(message: string): void };
  command?: string;
  timeoutMs?: number;
}

export class CodexCliProcessRunner {
  private readonly command: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly logger: CliOptions["logger"];
  private readonly timeoutMs: number;

  constructor(opts: CliOptions) {
    this.command = opts.command ?? opts.env.CODEX_CLI_PATH ?? "codex";
    this.env = opts.env;
    this.logger = opts.logger;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  async refresh(): Promise<{ ok: boolean }> {
    const res = await this.run(["auth", "refresh", "--json"]);
    return { ok: res.ok };
  }

  async login(): Promise<{ ok: boolean }> {
    const res = await this.run(["login", "--json"]);
    return { ok: res.ok };
  }

  private async run(args: string[]): Promise<CliRunResult> {
    const child = spawn(this.command, args, {
      env: this.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (buf) => { stdout += buf.toString("utf8"); });
    child.stderr?.on("data", (buf) => { stderr += buf.toString("utf8"); });

    const timer = setTimeout(() => {
      this.logger.warn(`codex CLI timed out after ${this.timeoutMs}ms (args: ${args.join(" ")})`);
      child.kill("SIGTERM");
    }, this.timeoutMs);

    const [code] = (await once(child, "close")) as [number | null, NodeJS.Signals | null];
    clearTimeout(timer);

    const ok = code === 0;
    if (!ok) {
      this.logger.warn(`codex CLI exited with code ${code}; stderr=${stderr.trim()}`);
    }

    return { ok, code, stdout, stderr };
  }
}
