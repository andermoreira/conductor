import assert from "node:assert/strict";
import test from "node:test";
import { AntigravityProvider, ClaudeProvider, CodexProvider, CursorProvider } from "@conductor/adapters";
import { ProcessProvider, type ParsedProviderLine } from "../packages/adapters/src/process-provider.js";
import type { AgentEvent, PermissionProfile, ProviderRunRequest } from "@conductor/core";

const readOnly: PermissionProfile = { filesystem: "read-only", shell: false, network: false };
const writable: PermissionProfile = { filesystem: "workspace-write", shell: true, network: false };

function request(permissions: PermissionProfile = readOnly): ProviderRunRequest {
  return { agentId: "test", prompt: "return an artifact", cwd: process.cwd(), permissions };
}

function argsFor(provider: object, permissions: PermissionProfile = readOnly): string[] {
  return (provider as { buildArgs(value: ProviderRunRequest): string[] }).buildArgs(request(permissions));
}

function parse(provider: object, line: string): { text?: string; finalText?: string } {
  return (provider as { parseLine(value: string): { text?: string; finalText?: string } }).parseLine(line);
}

class FixtureProvider extends ProcessProvider {
  readonly id = "fixture";
  protected readonly command = process.execPath;

  protected buildArgs(): string[] {
    return ["-e", `console.log('{"delta":"hello "}'); console.log('{"final":"artifact"}')`];
  }

  protected parseLine(line: string): ParsedProviderLine {
    const record = JSON.parse(line) as { delta?: string; final?: string };
    return { payload: record, text: record.delta, finalText: record.final };
  }
}

test("builds supported headless arguments for each adapter", () => {
  assert.deepEqual(argsFor(new ClaudeProvider()), [
    "-p", "return an artifact", "--output-format", "stream-json", "--verbose",
    "--permission-mode", "plan", "--disallowedTools", "Bash,Edit,Write"
  ]);
  assert.deepEqual(argsFor(new CodexProvider()), ["exec", "--json", "--sandbox", "read-only", "return an artifact"]);
  assert.deepEqual(argsFor(new CursorProvider()), ["-p", "--output-format", "stream-json", "--mode", "plan", "return an artifact"]);
  assert.deepEqual(argsFor(new CursorProvider(), writable), ["-p", "--output-format", "stream-json", "return an artifact"]);
  assert.deepEqual(argsFor(new AntigravityProvider()), [
    "-p", "return an artifact", "--output-format", "stream-json", "--sandbox", "--mode", "plan"
  ]);
});

test("parses final artifacts and text deltas from provider event fixtures", () => {
  assert.equal(
    parse(new ClaudeProvider(), '{"type":"result","result":"claude artifact"}').finalText,
    "claude artifact"
  );
  assert.equal(
    parse(new ClaudeProvider(), '{"event":{"delta":{"text":"claude delta"}}}').text,
    "claude delta"
  );
  assert.equal(
    parse(new CodexProvider(), '{"type":"item.completed","item":{"type":"agent_message","text":"codex artifact"}}').text,
    "codex artifact"
  );
  assert.equal(
    parse(new CursorProvider(), '{"type":"result","result":"cursor artifact"}').finalText,
    "cursor artifact"
  );
  assert.equal(
    parse(new AntigravityProvider(), '{"event":"result","result":{"response":"agy artifact"}}').finalText,
    "agy artifact"
  );
  assert.equal(parse(new CursorProvider(), "plain diagnostic").text, undefined);
  assert.equal(parse(new CursorProvider(), "plain diagnostic").finalText, undefined);
});

test("normalizes a mocked JSONL child process into durable agent events", async () => {
  const events: AgentEvent[] = [];
  for await (const event of new FixtureProvider().run(request())) events.push(event);

  assert.deepEqual(events.map((event) => event.type), ["started", "provider", "text", "provider", "completed"]);
  const finalEvent = events.at(-1);
  assert.equal(finalEvent?.type, "completed");
  if (finalEvent?.type !== "completed") assert.fail("mocked provider did not complete");
  assert.equal(finalEvent.finalText, "artifact");
});
