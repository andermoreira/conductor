import type { ProviderRunRequest } from "@conductor/core";
import { ProcessProvider, parseJson, record, type ParsedProviderLine } from "./process-provider.js";

export class CursorProvider extends ProcessProvider {
  readonly id = "cursor";
  protected readonly command = "cursor-agent";

  protected buildArgs(request: ProviderRunRequest): string[] {
    const args = ["-p", "--output-format", "stream-json"];
    if (request.model) args.push("--model", request.model);
    args.push(request.prompt);
    return args;
  }

  protected parseLine(line: string): ParsedProviderLine {
    const payload = parseJson(line);
    const item = record(payload);

    if (item?.type === "result" && typeof item.result === "string") {
      return { payload, finalText: item.result };
    }

    const message = record(item?.message);
    const content = record(message?.content);
    if (typeof content?.text === "string") {
      return { payload, text: content.text };
    }

    if (typeof item?.text === "string") {
      return { payload, text: item.text };
    }

    return { payload };
  }
}
