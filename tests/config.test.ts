import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "@conductor/config";

test("loads the bundled feature workflow and routing", async () => {
  const config = await loadConfig(process.cwd());

  assert.ok(config.workflows.feature);
  assert.equal(config.workflows.feature.steps.length, 5);
  assert.equal(config.routing.architect?.provider, "claude");
  assert.equal(config.routing.implementer?.provider, "codex");
  assert.equal(config.routing.reviewer?.provider, "antigravity");
  assert.equal(config.agents.reviewer?.permissions.filesystem, "read-only");
});
