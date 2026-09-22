import test from "node:test";
import assert from "node:assert/strict";
import type { AgentDefinition } from "@conductor/core";
import { composeAgentPrompt } from "@conductor/runtime";

test("composes only declared artifacts into the next agent prompt", () => {
  const agent: AgentDefinition = {
    id: "reviewer",
    role: "reviewer",
    capabilities: ["code-review"],
    permissions: {
      filesystem: "read-only",
      shell: false,
      network: false
    },
    prompt: "Review independently."
  };

  const prompt = composeAgentPrompt(agent, "Add endpoint", [
    { name: "task", content: "Add endpoint" },
    { name: "plan.md", content: "Change src/api.ts" }
  ]);

  assert.match(prompt, /Add endpoint/);
  assert.match(prompt, /Artifact: plan\.md/);
  assert.match(prompt, /Change src\/api\.ts/);
  assert.match(prompt, /Filesystem: read-only/);
});
