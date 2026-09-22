import type { ProviderRunRequest } from "@conductor/core";
import { ProcessProvider, parseJson, record, type ParsedProviderLine } from "./process-provider.js";

export class CodexProvider extends ProcessProvider {
  readonly id = "codex";
  protected readonly command = "codex";

  protected buildArgs(request: ProviderRunRequest): string[] {
    const sandbox = request.permissions.filesystem === "read-only"
      ? "read-only"
      : "workspace-write";

    const args = [
      "exec",
      "--json",
      "--sandbox",
      sandbox
    ];

    if (request.model) args.push("--model", request.model);
    if (request.effort) {
      args.push("-c", `model_reasoning_effort="${request.effort}"`);
    }

    args.push(request.prompt);
    return args;
  }

  protected parseLine(line: string): ParsedProviderLine {
    const payload = parseJson(line);
    const item = record(payload);

    if (item?.type === "item.completed") {
      const completed = record(item.item);
      if (completed?.type === "agent_message" && typeof completed.text === "string") {
        return { payload, text: completed.text };
      }
    }

    if (typeof item?.message === "string") {
      return { payload, text: item.message };
    }

    return { payload };
  }
}
