import type { ProviderRunRequest } from "@conductor/core";
import { ProcessProvider, parseJson, record, type ParsedProviderLine } from "./process-provider.js";

export class AntigravityProvider extends ProcessProvider {
  readonly id = "antigravity";
  protected readonly command = "agy";

  protected buildArgs(request: ProviderRunRequest): string[] {
    const args = ["-p", request.prompt, "--output-format", "stream-json", "--sandbox"];
    if (request.permissions.filesystem === "read-only") args.push("--mode", "plan");
    if (request.model) args.push("--model", request.model);
    if (request.effort && request.effort !== "xhigh") {
      args.push("--effort", request.effort);
    }
    return args;
  }

  protected parseLine(line: string): ParsedProviderLine {
    const payload = parseJson(line);
    const item = record(payload);

    if (item?.event === "result") {
      const result = record(item.result);
      if (typeof result?.response === "string") {
        return { payload, finalText: result.response };
      }
    }

    if (item?.event === "step_update") {
      const update = record(item.step_update);
      if (typeof update?.text_delta === "string") {
        return { payload, text: update.text_delta };
      }
    }

    return { payload };
  }
}
