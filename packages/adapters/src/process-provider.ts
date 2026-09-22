import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AgentEvent, Provider, ProviderRunRequest } from "@conductor/core";

export interface ParsedProviderLine {
  payload: unknown;
  text?: string;
  finalText?: string;
}

function now(): string {
  return new Date().toISOString();
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export abstract class ProcessProvider implements Provider {
  public abstract readonly id: string;
  protected abstract readonly command: string;

  protected abstract buildArgs(request: ProviderRunRequest): string[];
  protected abstract parseLine(line: string): ParsedProviderLine;

  async *run(request: ProviderRunRequest): AsyncIterable<AgentEvent> {
    yield {
      type: "started",
      at: now(),
      provider: this.id,
      agentId: request.agentId
    };

    const args = this.buildArgs(request);
    const child = spawn(this.command, args, {
      cwd: request.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stderr: string[] = [];
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr.push(chunk.toString());
    });

    let spawnError: Error | undefined;
    child.once("error", (error) => {
      spawnError = error;
    });

    const abort = () => child.kill("SIGTERM");
    request.signal?.addEventListener("abort", abort, { once: true });

    const closePromise = new Promise<number | null>((resolve) => {
      child.once("close", (code) => resolve(code));
    });

    let streamedText = "";
    let terminalText: string | undefined;

    if (child.stdout) {
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line.trim()) continue;

        const parsed = this.parseLine(line);
        yield {
          type: "provider",
          at: now(),
          provider: this.id,
          agentId: request.agentId,
          payload: parsed.payload
        };

        if (parsed.text) {
          streamedText += parsed.text;
          yield {
            type: "text",
            at: now(),
            provider: this.id,
            agentId: request.agentId,
            text: parsed.text
          };
        }

        if (parsed.finalText !== undefined) {
          terminalText = parsed.finalText;
        }
      }
    }

    const exitCode = await closePromise;
    request.signal?.removeEventListener("abort", abort);

    for (const chunk of stderr) {
      if (!chunk.trim()) continue;
      yield {
        type: "stderr",
        at: now(),
        provider: this.id,
        agentId: request.agentId,
        text: chunk
      };
    }

    if (spawnError || exitCode !== 0) {
      yield {
        type: "failed",
        at: now(),
        provider: this.id,
        agentId: request.agentId,
        exitCode,
        error: spawnError
          ? asErrorMessage(spawnError)
          : `${this.command} exited with code ${exitCode ?? "unknown"}`
      };
      return;
    }

    yield {
      type: "completed",
      at: now(),
      provider: this.id,
      agentId: request.agentId,
      exitCode: 0,
      finalText: terminalText ?? streamedText
    };
  }
}

export function parseJson(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return { raw: line };
  }
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
