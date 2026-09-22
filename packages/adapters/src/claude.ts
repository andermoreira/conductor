import type { ProviderRunRequest } from "@conductor/core";
import { ProcessProvider, parseJson, record, type ParsedProviderLine } from "./process-provider.js";

export class ClaudeProvider extends ProcessProvider {
  readonly id = "claude";
  protected readonly command = "claude";

  protected buildArgs(request: ProviderRunRequest): string[] {
    const args = ["-p", request.prompt, "--output-format", "stream-json", "--verbose"];

    if (request.model) args.push("--model", request.model);

    if (request.permissions.filesystem === "read-only") {
      args.push("--permission-mode", "plan");
    }

    const denied: string[] = [];
    if (!request.permissions.shell) denied.push("Bash");
    if (request.permissions.filesystem === "read-only") denied.push("Edit", "Write");
    if (denied.length > 0) args.push("--disallowedTools", denied.join(","));

    return args;
  }

  protected parseLine(line: string): ParsedProviderLine {
    const payload = parseJson(line);
    const item = record(payload);

    if (item?.type === "result" && typeof item.result === "string") {
      return { payload, finalText: item.result };
    }

    const event = record(item?.event);
    const delta = record(event?.delta);
    if (typeof delta?.text === "string") {
      return { payload, text: delta.text };
    }

    return { payload };
  }
}
