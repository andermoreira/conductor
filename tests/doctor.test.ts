import assert from "node:assert/strict";
import test from "node:test";
import { runDoctor } from "../apps/cli/src/doctor.js";
import type { CommandResult } from "@conductor/workspace";

const success = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: "" });
const failure = (stdout: string): CommandResult => ({ exitCode: 1, stdout, stderr: "" });

test("doctor verbose does not trust failed or raw authentication probes", async () => {
  const output: string[] = [];
  const calls: string[][] = [];
  const failed = await runDoctor({
    verbose: true,
    write: (line) => output.push(line),
    run: async (_command, args) => {
      calls.push(args);
      if (args[0] === "--version") return success("test version");
      return failure("Logged in with secret account; --json --sandbox --output-format stream-json");
    }
  });

  assert.equal(failed, false);
  assert.equal(output.filter((line) => line === "  authentication: unknown").length, 4);
  assert.equal(output.filter((line) => line === "  headless adapter flags: unverified").length, 4);
  assert.equal(output.some((line) => line.includes("secret account")), false);
  assert.equal(calls.some((args) => args.join(" ") === "status"), true);
  assert.equal(calls.filter((args) => args.join(" ") === "status").length, 1);
});

test("doctor verbose requires Antigravity plan mode", async () => {
  const output: string[] = [];
  await runDoctor({
    verbose: true,
    write: (line) => output.push(line),
    run: async (command, args) => {
      if (args[0] === "--version") return success("test version");
      if (args[0] === "--help") {
        const flags = command === "agy"
          ? "-p --output-format stream-json --sandbox"
          : "-p --output-format stream-json --permission-mode --mode";
        return success(flags);
      }
      if (args.join(" ") === "exec --help") return success("--json --sandbox");
      return success("Logged in");
    }
  });

  const agy = output.indexOf("✓ Antigravity CLI: test version");
  assert.notEqual(agy, -1);
  assert.equal(output[agy + 2], "  headless adapter flags: unverified");
});
