import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCleanRepository,
  runCommand,
  workspaceFingerprint
} from "@conductor/workspace";

test("fingerprint detects mutations and clean guard rejects dirty repositories", async () => {
  const dir = await mkdtemp(join(tmpdir(), "conductor-test-"));

  try {
    await runCommand("git", ["init"], dir);
    await writeFile(join(dir, "file.txt"), "one\n", "utf8");
    await runCommand("git", ["add", "file.txt"], dir);
    await runCommand(
      "git",
      [
        "-c", "user.name=Conductor Test",
        "-c", "user.email=conductor@example.invalid",
        "commit", "-m", "initial"
      ],
      dir
    );

    await assertCleanRepository(dir);
    const before = await workspaceFingerprint(dir);

    await writeFile(join(dir, "file.txt"), "two\n", "utf8");
    const after = await workspaceFingerprint(dir);

    assert.notEqual(before, after);
    await assert.rejects(() => assertCleanRepository(dir), /uncommitted changes/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
