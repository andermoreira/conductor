import assert from "node:assert/strict";
import test from "node:test";
import { runDoctor } from "../apps/cli/src/doctor.js";
import type { CommandResult } from "@conductor/workspace";

const success = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: "" });
const failure = (stdout: string): CommandResult => ({ exitCode: 1, stdout, stderr: "" });

test("doctor verbose does not trust failed or raw authentication probes", async () => {
  const output: string[] = [];
  const failed = await runDoctor({
    verbose: true,
    write: (line) => output.push(line),
    run: async (_command, args) => {
      if (args[0] === "--version") return success("test version");
      return failure("Logged in with secret account; --json --sandbox --output-format stream-json");
    }
  });

  assert.equal(failed, false);
  assert.equal(output.filter((line) => line === "  authentication: unknown").length, 4);
  assert.equal(output.filter((line) => line === "  headless adapter flags: unverified").length, 4);
  assert.equal(output.some((line) => line.includes("secret account")), false);
});
